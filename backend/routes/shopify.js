const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { enviarEmailInscripcion, enviarEmailInvitacion } = require('../routes/emails');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const generarToken = () => crypto.randomBytes(24).toString('hex');

router.post('/webhook/order', async (req, res) => {
  console.log('Webhook Shopify recibido!', req.body?.email);
  const order = req.body;
  const supabase = getSupabase();

  try {
    const email = order.email;

    // Calcular cantidad total comprada
    const cantidad = order.line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;

    const { data: user } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(200).json({ mensaje: 'Usuario no encontrado en Korva' });
    }

    const { data: pendiente } = await supabase
      .from('user_challenges')
      .select('id, modalidad, challenge_id, challenges(title)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (pendiente) {
      // Activar al comprador principal
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

      // Si compró más de 1, generar tokens de invitación
      if (cantidad > 1) {
        const tokens = [];
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

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

        // Mandar email con los links de invitación
        enviarEmailInvitacion(
          user.email,
          user.name,
          pendiente.challenges.title,
          tokens
        );
      }
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;