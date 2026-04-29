require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stravaRoutes = require('./routes/strava');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexion a Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

app.use(cors());
app.use(express.json());
app.use('/strava', stravaRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'Bienvenido al backend de Korva 🏅',
    estado: 'funcionando'
  });
});

// Ruta para probar conexion con Supabase
app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) throw error;
    res.json({ mensaje: 'Conexion a Supabase exitosa 🎉', data });
  } catch (error) {
    res.json({ mensaje: 'Supabase conectado, tabla users aun no existe', detalle: error.message });
  }
});
// Ruta para obtener todos los challenges disponibles
app.get('/challenges', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.json({ error: 'Error obteniendo challenges', detalle: error.message });
  }
});
// Inscribir usuario a un challenge
app.post('/challenges/inscribir', async (req, res) => {
  const { user_id, challenge_id, modalidad } = req.body;

  try {
    const { data: existente } = await supabase
      .from('user_challenges')
      .select('id')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .eq('modalidad', modalidad)
      .single();

    if (existente) {
      return res.json({ mensaje: 'Ya estas inscripto en este challenge con esta modalidad' });
    }

    const { data, error } = await supabase
      .from('user_challenges')
      .insert({
        user_id,
        challenge_id,
        modalidad,
        status: 'active',
        km_completed: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      mensaje: 'Inscripcion exitosa! Ya podes empezar tu reto',
      id: data.id
    });

  } catch (error) {
    res.json({ error: 'Error al inscribirse', detalle: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`Servidor Korva corriendo en puerto ${PORT}`);
});