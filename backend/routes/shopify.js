const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { enviarEmailInscripcion, enviarEmailInvitacion } = require('../routes/emails');

const SHOPIFY_WEBHOOK_SECRET = '4b50434416a39f4c3538e11b8648cda6182c020a882943051b8a39854f5898f6';

// Mapa product_id de Shopify → challenge_id en Supabase
const PRODUCT_CHALLENGE_MAP = {
  '8780043288754': 'ae54af78-dc6f-4cf5-af31-2c077ba58048', // Fin del Mundo 103km
  // '': '85a362a5-eee7-456d-9027-358d44446004', // San Andrés 27K — agregar cuando esté en Shopify
  // '': '64442b1d-12b8-4a58-a951-50ea10cb2131', // Dubrovnik 19K — agregar cuando esté en Shopify
};

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const generarToken = () => crypto.randomBytes(24).toString('hex');

// ✅ Verificar firma HMAC de Shopify
const verificarFirmaShopify = (rawBody, hmacHeader) => {
  if (!hmacHeader) return false;
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
};

router.post('/webhook/order', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verificar firma antes de procesar
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!verificarFirmaShopify(req.body, hmacHeader)) {
    console.warn('Webhook Shopify rechazado: firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  // Parsear el body una vez verificado
  let order;
  try {
    order = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Body inválido' });
  }

  console.log('Webhook Shopify verificado!', order?.email);
  const supabase = getSupabase();

  try {
    const email = order.email;
    const cantidad = order.line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;

    // Buscar challenge por product_id del primer item
    const productId = String(order.line_items?.[0]?.product_id || '');
    const challengeIdFromProduct = PRODUCT_CHALLENGE_MAP[productId];

    let user = null;

    // Buscar usuario existente
    const { data: usuarioExistente } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .single();

    if (usuarioExistente) {
      user = usuarioExistente;
    } else if (challengeIdFromProduct) {
      // Crear usuario nuevo
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

    let pendiente = null;

    // Buscar challenge pendiente del usuario
    const { data: pendienteExistente } = await supabase
      .from('user_challenges')
      .select('id, modalidad, challenge_id, challenges(title)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (pendienteExistente) {
      pendiente = pendienteExistente;
    } else if (challengeIdFromProduct) {
      // Usuario nuevo o sin pendiente — inscribir directamente en el challenge del producto
      const { data: nuevaInscripcion } = await supabase
        .from('user_challenges')
        .insert({
          user_id: user.id,
          challenge_id: challengeIdFromProduct,
          modalidad: 'run', // default, el usuario puede cambiarlo desde la app
          status: 'pending',
          km_completed: 0,
          started_at: new Date().toISOString(),
        })
        .select('id, modalidad, challenge_id, challenges(title)')
        .single();

      if (nuevaInscripcion) {
        pendiente = nuevaInscripcion;
        console.log('Inscripción automática creada para:', email);
      }
    }

    if (pendiente) {
      await supabase
        .from('user_challenges')
        .update({ status: 'active' })
        .eq('id', pendiente.id);

      console.log('Challenge activado para:', email);

      if (user.email && pendiente.challenges?.title) {
        enviarEmailInscripcion(
          user.email,
          user.name,
          pendiente.challenges.title,
          pendiente.modalidad === 'run' ? 'Running' : 'Ciclismo'
        );
      }

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
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;