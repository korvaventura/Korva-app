const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { enviarEmailInscripcion } = require('../routes/emails');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

router.post('/webhook/order', async (req, res) => {
  console.log('Webhook Shopify recibido!', req.body?.email);
  const order = req.body;
  const supabase = getSupabase();

  try {
    const email = order.email;

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
      .select('id, modalidad, challenges(title)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (pendiente) {
      await supabase
        .from('user_challenges')
        .update({ status: 'active' })
        .eq('id', pendiente.id);

      console.log('Challenge activado para:', email);

      // Enviar email de confirmacion
      if (user.email && pendiente.challenges?.title) {
        enviarEmailInscripcion(
          user.email,
          user.name,
          pendiente.challenges.title,
          pendiente.modalidad === 'run' ? 'Running' : 'Ciclismo'
        );
      }
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;