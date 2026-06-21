const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { enviarEmailInscripcionConBib, enviarEmailInscripcion, enviarEmailInvitacion } = require('../routes/emails');
const { generarBibYPostal, asignarBibNumber } = require('../generador_bib');

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// Mapa product_id de Shopify → challenge_id en Supabase
const PRODUCT_CHALLENGE_MAP = {
  '8780043288754': 'ae54af78-dc6f-4cf5-af31-2c077ba58048', // Fin del Mundo 103km
  // Agregar San Andrés y Dubrovnik cuando estén en Shopify:
  // '': '85a362a5-eee7-456d-9027-358d44446004', // San Andrés 27K
  // '': '64442b1d-12b8-4a58-a951-50ea10cb2131', // Dubrovnik 19K
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
const activarChallengeYEnviarBib = async (supabase, user, pendiente) => {
  // 1. Activar el challenge
  await supabase
    .from('user_challenges')
    .update({ status: 'active' })
    .eq('id', pendiente.id);

  console.log('Challenge activado para:', user.email);

  // 2. Asignar número de bib (si no tiene uno ya)
  let bibNumber = user.bib_number;
  if (!bibNumber) {
    bibNumber = await asignarBibNumber(supabase, user.id);
  }

  // 3. Generar dorsal y postal PDF
  const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, pendiente.challenge_id);

  // 4. Mandar email con o sin adjuntos según si se generaron bien
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
    // Fallback sin adjuntos
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
    const cantidad = order.line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;
    const productId = String(order.line_items?.[0]?.product_id || '');
    const challengeIdFromProduct = PRODUCT_CHALLENGE_MAP[productId];

    // Buscar o crear usuario
    let user = null;
    const { data: usuarioExistente } = await supabase
      .from('users')
      .select('id, email, name, bib_number')
      .eq('email', email)
      .maybeSingle();

    if (usuarioExistente) {
      user = usuarioExistente;
    } else if (challengeIdFromProduct) {
      const nombreCompleto = [order.shipping_address?.first_name, order.shipping_address?.last_name]
        .filter(Boolean).join(' ') || email.split('@')[0];

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

    // Buscar challenge pendiente o crear inscripción
    let pendiente = null;
    const { data: pendienteExistente } = await supabase
      .from('user_challenges')
      .select('id, modalidad, challenge_id, challenges(title)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendienteExistente) {
      pendiente = pendienteExistente;
      // Asegurar que tenga group_id (self) si no lo tenía
      await supabase
        .from('user_challenges')
        .update({ group_id: user.id })
        .eq('id', pendiente.id)
        .is('group_id', null);
    } else if (challengeIdFromProduct) {
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

    if (!pendiente) {
      return res.status(200).json({ mensaje: 'No se encontró challenge pendiente' });
    }

    // Activar y enviar bib
    await activarChallengeYEnviarBib(supabase, user, pendiente);

    // Si compró más de 1, generar tokens de invitación
    if (cantidad > 1) {
      const tokens = [];
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      for (let i = 0; i < cantidad - 1; i++) {
        const token = generarToken();
        await supabase.from('invitations').insert({
          token,
          challenge_id: pendiente.challenge_id,
          created_by: user.id,
          expires_at: expiresAt.toISOString()
        });
        tokens.push(token);
      }
      console.log(`Generados ${tokens.length} tokens de invitación para ${email}`);
      enviarEmailInvitacion(user.email, user.name, pendiente.challenges.title, tokens);
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;