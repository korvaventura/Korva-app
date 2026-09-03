const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { enviarEmailInscripcionConBib, enviarEmailInscripcion, enviarEmailInvitacion, enviarEmailAdmin } = require('../routes/emails');
const { generarBibYPostal, asignarBibNumber } = require('../generador_bib');

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// Mapa product_id de Shopify → challenge_id en Supabase
const PRODUCT_CHALLENGE_MAP = {
  '8780043288754': 'ae54af78-dc6f-4cf5-af31-2c077ba58048', // Fin del Mundo 103km
  '8908019957938': '85a362a5-eee7-456d-9027-358d44446004', // San Andrés 57km
  '8908019466418': '64442b1d-12b8-4a58-a951-50ea10cb2131', // Dubrovnik 19.4km
  '8999917191346': '881936a8-2282-4b7d-a94d-24a7c796d789', // Monte Fuji 68km
};

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const generarToken = () => crypto.randomBytes(24).toString('hex');

const verificarFirmaShopify = (rawBody, hmacHeader) => {
  if (!hmacHeader) return false;
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
};

// Función centralizada para activar un challenge y enviar bib+postal
const activarChallengeYEnviarBib = async (supabase, user, pendiente, enviarBib = true) => {
  // 1. Activar el challenge
  await supabase
    .from('user_challenges')
    .update({ status: 'active' })
    .eq('id', pendiente.id);

  console.log('Challenge activado para:', user.email, '-', pendiente.challenges?.title);

  // 2. Usar numero_bib del challenge específico, fallback a bib_number global
  let bibNumber = pendiente.numero_bib || user.bib_number;
  if (!bibNumber) {
    bibNumber = await asignarBibNumber(supabase, user.id);
    user.bib_number = bibNumber;
  }

  // 3. Si no hay que enviar bib (flag), salir acá
  if (!enviarBib) {
    console.log('Challenge activado sin email de bib para:', user.email);
    return bibNumber;
  }

  // 4. Generar dorsal y postal PDF — uno por cada desafío
  const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, pendiente.challenge_id);

  // 5. Mandar email con o sin adjuntos según si se generaron bien
  if (pdfs) {
    await enviarEmailInscripcionConBib(
      user.email,
      user.name,
      pendiente.challenges?.title,
      pendiente.modalidad === 'run' ? 'Running' : 'Ciclismo',
      pdfs.dorsalPdf,
      pdfs.postalPdf,
      bibNumber
    );
  } else {
    await enviarEmailInscripcion(
      user.email,
      user.name,
      pendiente.challenges?.title,
      pendiente.modalidad === 'run' ? 'Running' : 'Ciclismo'
    );
    console.warn('Bib no generado para:', user.email, '— email enviado sin adjuntos');
  }

  return bibNumber;
};

router.post('/webhook/order', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verificar firma Shopify
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!verificarFirmaShopify(req.body, hmacHeader)) {
    console.warn('Webhook Shopify rechazado: firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let order;
  try {
    order = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido' });
  }

  console.log('Webhook Shopify verificado!', order?.email);
  const supabase = getSupabase();

  // Protección contra reintentos duplicados de Shopify: si esta orden ya fue procesada, no hacer nada más.
  // Esto evita crear dos inscripciones cuando Shopify reenvía el mismo webhook (algo que hace normalmente
  // si la primera respuesta tarda, sin que sea un error real).
  const orderId = String(order.id || order.order_number || '');
  if (orderId) {
    const { error: errorOrden } = await supabase
      .from('shopify_orders_procesadas')
      .insert({ order_id: orderId });

    if (errorOrden) {
      // Ya existe esa orden -> es un reintento, no procesamos de nuevo.
      console.log('Webhook duplicado ignorado, orden ya procesada:', orderId);
      return res.status(200).json({ mensaje: 'Orden ya procesada anteriormente' });
    }
  }

  try {
    const email = (order.email || '').trim().toLowerCase();

    // Buscar el nombre del usuario
    const nombreShipping = [order.shipping_address?.first_name, order.shipping_address?.last_name].filter(Boolean).join(' ');
    const nombreBilling = [order.billing_address?.first_name, order.billing_address?.last_name].filter(Boolean).join(' ');
    const nombreCustomer = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ');
    const nombreCompleto = nombreShipping || nombreBilling || nombreCustomer || email.split('@')[0];

    // Buscar o crear usuario UNA SOLA VEZ
    let user = null;
    const { data: usuarioExistente } = await supabase
      .from('users')
      .select('id, email, name, bib_number')
      .eq('email', email)
      .maybeSingle();

    if (usuarioExistente) {
      user = usuarioExistente;
    } else {
      const { data: nuevoUsuario, error: errorUsuario } = await supabase
        .from('users')
        .insert({
          email,
          name: nombreCompleto,
          shipping_address: order.shipping_address ? {
            nombre: nombreCompleto,
            direccion: order.shipping_address.address1,
            ciudad: order.shipping_address.city,
            codigo_postal: order.shipping_address.zip,
            pais: order.shipping_address.country,
            telefono: order.shipping_address.phone || '',
          } : null,
        })
        .select()
        .single();

      if (!errorUsuario) {
        user = nuevoUsuario;
        console.log('Usuario nuevo creado:', email);
      }
    }

    if (!user) {
      return res.status(200).json({ mensaje: 'Usuario no encontrado y no se pudo crear' });
    }

    // Procesar CADA line_item por separado — permite comprar múltiples desafíos
    const lineItems = order.line_items || [];
    let primerDesafioActivado = null;
    let totalInvitados = 0;

    for (const lineItem of lineItems) {
      const productId = String(lineItem.product_id || '');
      const challengeIdFromProduct = PRODUCT_CHALLENGE_MAP[productId];
      const cantidadItem = lineItem.quantity || 1;

      if (!challengeIdFromProduct) {
        console.log(`Producto no mapeado: ${productId}`);
        continue;
      }

      // Verificar si ya tiene este challenge activo (evitar duplicados)
      const { data: yaExiste } = await supabase
        .from('user_challenges')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeIdFromProduct)
        .in('status', ['active', 'completed', 'shipped', 'cargado'])
        .maybeSingle();

      if (yaExiste) {
        console.log(`Challenge ${challengeIdFromProduct} ya activo para ${email}`);
        continue;
      }

      // Buscar challenge pendiente para este producto específico
      let pendiente = null;
      const { data: pendienteExistente } = await supabase
        .from('user_challenges')
        .select('id, modalidad, challenge_id, challenges(title)')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeIdFromProduct)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendienteExistente) {
        pendiente = pendienteExistente;
        await supabase.from('user_challenges').update({ group_id: user.id }).eq('id', pendiente.id).is('group_id', null);
      } else {
        const { data: nuevaInscripcion } = await supabase
          .from('user_challenges')
          .insert({
            user_id: user.id,
            challenge_id: challengeIdFromProduct,
            modalidad: 'run',
            status: 'pending',
            km_completed: 0,
            started_at: new Date().toISOString(),
            group_id: user.id,
          })
          .select('id, modalidad, challenge_id, challenges(title)')
          .single();

        if (nuevaInscripcion) pendiente = nuevaInscripcion;
      }

      if (!pendiente) continue;

      // Asignar numero_bib específico del challenge si no lo tiene
      if (!pendiente.numero_bib) {
        const { data: maxBib } = await supabase
          .from('user_challenges')
          .select('numero_bib')
          .eq('challenge_id', challengeIdFromProduct)
          .not('numero_bib', 'is', null)
          .order('numero_bib', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextBib = (maxBib?.numero_bib || 0) + 1;
        await supabase.from('user_challenges').update({ numero_bib: nextBib }).eq('id', pendiente.id);
        pendiente.numero_bib = nextBib;
      }

      // Activar challenge y enviar bib — uno por cada desafío distinto
      await activarChallengeYEnviarBib(supabase, user, pendiente, true);
      if (!primerDesafioActivado) primerDesafioActivado = pendiente;

      // Si compró más de 1 del mismo desafío, avisar a Korva para activar manualmente
      if (cantidadItem > 1) {
        await enviarEmailAdmin(
          `👥 Compra grupal — activación manual requerida`,
          `Email: ${email}\nNombre: ${nombreCompleto}\nDesafío: ${pendiente.challenges?.title}\nCantidad total: ${cantidadItem}\nGroup ID (usar al activar): ${user.id}\n\nActivar manualmente a ${cantidadItem - 1} persona(s) adicional(es) para este desafío con group_id = ${user.id}`
        );
        // Generar tokens de invitación para el email al comprador
        const tokens = [];
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        for (let i = 0; i < cantidadItem - 1; i++) {
          const token = generarToken();
          await supabase.from('invitations').insert({
            token,
            challenge_id: pendiente.challenge_id,
            created_by: user.id,
            expires_at: expiresAt.toISOString()
          });
          tokens.push(token);
        }
        enviarEmailInvitacion(user.email, user.name, pendiente.challenges?.title, tokens);
      }
    }

    // Si hubo más de un desafío activado, agruparlos todos con group_id = user.id
    const { data: challengesCreados } = await supabase
      .from('user_challenges')
      .select('id')
      .eq('user_id', user.id)
      .in('challenge_id', lineItems.map(li => PRODUCT_CHALLENGE_MAP[String(li.product_id || '')]).filter(Boolean))
      .in('status', ['active', 'pending']);

    if (challengesCreados && challengesCreados.length > 1) {
      for (const uc of challengesCreados) {
        await supabase.from('user_challenges').update({ group_id: user.id }).eq('id', uc.id);
      }
      console.log(`Multi-desafío agrupado: ${challengesCreados.length} retos para ${email}`);
    }

    res.status(200).json({ mensaje: 'Challenges activados exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;

// ─── Webhook de cancelación de orden ──────────────────────────────────
router.post('/webhook/cancelled', express.raw({ type: 'application/json' }), async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!verificarFirmaShopify(req.body, hmacHeader)) {
    console.warn('Webhook Shopify (cancelled) rechazado: firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let order;
  try {
    order = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido' });
  }

  console.log('Webhook Shopify de cancelación recibido:', order?.email);
  const supabase = getSupabase();

  try {
    await cancelarInscripcionPorOrden(supabase, order);
    res.status(200).json({ mensaje: 'Cancelación procesada' });
  } catch (error) {
    console.error('Error procesando cancelación:', error.message);
    res.status(200).json({ error: 'Error procesando cancelación', detalle: error.message });
  }
});

// ─── Webhook de reembolso ──────────────────────────────────────────────
router.post('/webhook/refund', express.raw({ type: 'application/json' }), async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!verificarFirmaShopify(req.body, hmacHeader)) {
    console.warn('Webhook Shopify (refund) rechazado: firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let refund;
  try {
    refund = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido' });
  }

  console.log('Webhook Shopify de reembolso recibido, order_id:', refund?.order_id);
  const supabase = getSupabase();

  try {
    // El evento refunds/create no trae el email directamente — viene en el order asociado.
    // Shopify incluye el "order" anidado en algunos payloads; si no está, buscamos por order_id.
    const email = refund?.order?.email || null;
    if (!email) {
      console.warn('Reembolso sin email asociado directamente, no se puede identificar al usuario automáticamente. Order ID:', refund?.order_id);
      return res.status(200).json({ mensaje: 'Reembolso recibido pero sin email para identificar usuario' });
    }
    await cancelarInscripcionPorOrden(supabase, { email });
    res.status(200).json({ mensaje: 'Reembolso procesado' });
  } catch (error) {
    console.error('Error procesando reembolso:', error.message);
    res.status(200).json({ error: 'Error procesando reembolso', detalle: error.message });
  }
});

// Función compartida: borra la inscripción (pending o active) más reciente del usuario
// asociado a este email, para el producto de esta orden. Si no encuentra el challenge exacto
// por product_id, borra la inscripción pending/active más reciente del usuario en general
// (mejor esfuerzo — Shopify no siempre manda el detalle completo del producto en cancelaciones/reembolsos).
const cancelarInscripcionPorOrden = async (supabase, order) => {
  const email = (order.email || '').trim().toLowerCase();
  if (!email) {
    console.warn('Cancelación/reembolso sin email, no se puede procesar.');
    return;
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();

  if (!user) {
    console.warn('Usuario no encontrado para cancelación/reembolso:', email);
    return;
  }

  // Iterar todos los line_items para cancelar el challenge correcto por producto
  const lineItems = order.line_items || [];
  const challengeIdsACancelar = lineItems
    .map(item => PRODUCT_CHALLENGE_MAP[String(item.product_id || '')])
    .filter(Boolean);

  if (challengeIdsACancelar.length === 0) {
    // Si no hay line_items mapeados, cancelar la más reciente como mejor esfuerzo
    const { data: inscripcion } = await supabase
      .from('user_challenges')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'active'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inscripcion) {
      await supabase.from('user_challenges').delete().eq('id', inscripcion.id);
      console.log(`Inscripción cancelada (sin producto mapeado) para ${email}:`, inscripcion.id);
    }
    return;
  }

  // Cancelar cada challenge mapeado
  for (const challengeId of challengeIdsACancelar) {
    const { data: inscripcion } = await supabase
      .from('user_challenges')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('challenge_id', challengeId)
      .in('status', ['pending', 'active'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inscripcion) {
      await supabase.from('user_challenges').delete().eq('id', inscripcion.id);
      console.log(`Inscripción cancelada para ${email}, challenge ${challengeId}:`, inscripcion.id);
    }
  }
};