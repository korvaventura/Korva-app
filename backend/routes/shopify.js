const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// Webhook de Shopify — se llama cuando alguien paga
router.post('/webhook/order', async (req, res) => {
  const order = req.body;
  const supabase = getSupabase();

  try {
    const email = order.email;
    const nombre = `${order.billing_address?.first_name} ${order.billing_address?.last_name}`;

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
    }

    res.status(200).json({ mensaje: 'Challenge activado exitosamente' });

  } catch (error) {
    res.status(200).json({ error: 'Error procesando webhook', detalle: error.message });
  }
});

module.exports = router;