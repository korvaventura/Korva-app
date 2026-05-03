const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

router.post('/webhook', async (req, res) => {
  console.log('Webhook MercadoPago recibido!', req.body);
  const { type, data } = req.body;
  const supabase = getSupabase();

  try {
    // Solo procesar pagos aprobados
    if (type !== 'payment') {
      return res.status(200).json({ mensaje: 'Evento ignorado' });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return res.status(200).json({ mensaje: 'Sin ID de pago' });
    }

    // Consultar el pago a Mercado Pago API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      }
    });

    const pago = await mpResponse.json();
    console.log('Estado del pago:', pago.status, pago.payer?.email);

    if (pago.status !== 'approved') {
      return res.status(200).json({ mensaje: 'Pago no aprobado, ignorado' });
    }

    const email = pago.payer?.email;

    // Buscar usuario por email
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(200).json({ mensaje: 'Usuario no encontrado en Korva' });
    }

    // Activar el challenge pendiente mas reciente
    const { data: pendiente } = await supabase
      .from('user_challenges')
      .select('id')
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
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    console.error('Error webhook MP:', error);
    res.status(200).json({ error: 'Error procesando webhook' });
  }
});

module.exports = router;