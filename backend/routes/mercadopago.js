const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { enviarEmailInscripcion } = require('../routes/emails');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

router.post('/webhook', async (req, res) => {
  console.log('Webhook MercadoPago recibido!', req.body);
  const { type, data } = req.body;
  const supabase = getSupabase();

  try {
    if (type !== 'payment') {
      return res.status(200).json({ mensaje: 'Evento ignorado' });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return res.status(200).json({ mensaje: 'Sin ID de pago' });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });

    const pago = await mpResponse.json();
    console.log('Estado del pago:', pago.status, pago.payer?.email);

    if (pago.status !== 'approved') {
      return res.status(200).json({ mensaje: 'Pago no aprobado, ignorado' });
    }

    const email = pago.payer?.email;

    const { data: user } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .single();

  if (!user) {
  // Avisar por email que hay un pago sin usuario asociado
  const { enviarEmailAdmin } = require('../routes/emails');
  enviarEmailAdmin(
    `Pago sin usuario - $${pago.transaction_amount}`,
    `Email del pagador: ${email}\nMonto: $${pago.transaction_amount}\nID pago: ${paymentId}\n\nActivar manualmente en Supabase.`
  );
  return res.status(200).json({ mensaje: 'Usuario no encontrado, admin notificado' });
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
    console.error('Error webhook MP:', error);
    res.status(200).json({ error: 'Error procesando webhook' });
  }
});

module.exports = router;