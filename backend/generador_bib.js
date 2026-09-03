const { spawn } = require('child_process');
const path = require('path');

// Mapa de plantillas por challenge_id
const PLANTILLAS = {
  'ae54af78-dc6f-4cf5-af31-2c077ba58048': { dorsal: 'Dorsales.pptx',           postal: 'Postales.pptx' },           // Fin del Mundo
  '85a362a5-eee7-456d-9027-358d44446004': { dorsal: 'Dorsales_SanAndres.pptx', postal: 'Postales_SanAndres.pptx' }, // San Andrés
  '64442b1d-12b8-4a58-a951-50ea10cb2131': { dorsal: 'Dorsales_Dubrovnik.pptx', postal: 'Postales_Dubrovnik.pptx' }, // Dubrovnik
  '881936a8-2282-4b7d-a94d-24a7c796d789': { dorsal: 'Dorsales_MonteFuji.pptx', postal: 'Postales_MonteFuji.pptx' }, // Monte Fuji
};

const DEFAULT_PLANTILLAS = { dorsal: 'Dorsales.pptx', postal: 'Postales.pptx' };

const generarBibYPostal = async (supabase, nombre, bibNumber, challengeId) => {
  try {
    const plantillas = PLANTILLAS[challengeId] || DEFAULT_PLANTILLAS;
    console.log('Descargando plantillas:', plantillas);

    const { data: dorsalData, error: e1 } = await supabase.storage
      .from('korva-images')
      .download(`Plantillas/${plantillas.dorsal}`);
    if (e1) { console.error('Error descargando dorsal:', e1); throw new Error('No se pudo descargar dorsal: ' + e1.message); }
    console.log('Dorsal descargado OK');

    const { data: postalData, error: e2 } = await supabase.storage
      .from('korva-images')
      .download(`Plantillas/${plantillas.postal}`);
    if (e2) { console.error('Error descargando postal:', e2); throw new Error('No se pudo descargar postal: ' + e2.message); }
    console.log('Postal descargado OK');

    const dorsalB64 = Buffer.from(await dorsalData.arrayBuffer()).toString('base64');
    const postalB64 = Buffer.from(await postalData.arrayBuffer()).toString('base64');
    console.log('Buffers convertidos OK');

    const scriptPath = path.join(__dirname, 'generar_bib_postal.py');
    const input = JSON.stringify({ nombre, bib_number: bibNumber, dorsal_template: dorsalB64, postal_template: postalB64 });

    const resultado = await new Promise((resolve, reject) => {
      const proc = spawn('python3', [scriptPath], { timeout: 90000 });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => { stderr += d; console.error('Python stderr:', d.toString()); });
      proc.stdin.write(input);
      proc.stdin.end();
      proc.on('close', (code) => {
        console.log('Python exit code:', code, 'stdout length:', stdout.length);
        if (code !== 0) reject(new Error(`Python error (code ${code}): ${stderr}`));
        else resolve(stdout);
      });
    });

    const { dorsal_pdf, postal_pdf } = JSON.parse(resultado);
    console.log('PDFs generados OK');
    return { dorsalPdf: dorsal_pdf, postalPdf: postal_pdf };

  } catch (error) {
    console.error('Error generando bib:', error.message);
    return null;
  }
};

const asignarBibNumber = async (supabase, userId) => {
  try {
    // Usar la secuencia de Supabase
    const { data, error } = await supabase.rpc('get_next_bib_number');
    if (error) throw error;
    const bibNumber = data;
    await supabase.from('users').update({ bib_number: bibNumber }).eq('id', userId);
    return bibNumber;
  } catch (error) {
    console.error('Error asignando bib number:', error.message);
    // Fallback: buscar el máximo actual y sumar 1
    const { data: maxData } = await supabase
      .from('users')
      .select('bib_number')
      .order('bib_number', { ascending: false })
      .limit(1)
      .single();
    const bibNumber = (maxData?.bib_number || 220) + 1;
    await supabase.from('users').update({ bib_number: bibNumber }).eq('id', userId);
    return bibNumber;
  }
};

const generarCertificado = async (supabase, nombre, nombreDesafio, distanciaKm, bibNumber, fechaCompletado, numeroSerie) => {
  try {
    const { data: certData, error: e1 } = await supabase.storage
      .from('korva-images')
      .download('Plantillas/Certificado_Finisher.pptx');
    if (e1) { console.error('Error descargando certificado:', e1); throw new Error('No se pudo descargar certificado: ' + e1.message); }

    const certB64 = Buffer.from(await certData.arrayBuffer()).toString('base64');

    const scriptPath = path.join(__dirname, 'generar_certificado.py');
    const input = JSON.stringify({
      nombre,
      nombre_desafio: nombreDesafio,
      distancia_km: distanciaKm,
      bib_number: bibNumber,
      fecha_completado: fechaCompletado,
      numero_serie: numeroSerie,
      certificado_template: certB64,
    });

    const resultado = await new Promise((resolve, reject) => {
      const proc = spawn('python3', [scriptPath], { timeout: 90000 });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => { stderr += d; console.error('Python stderr (certificado):', d.toString()); });
      proc.stdin.write(input);
      proc.stdin.end();
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`Python error certificado (code ${code}): ${stderr}`));
        else resolve(stdout);
      });
    });

    const { certificado_pdf } = JSON.parse(resultado);
    return certificado_pdf;

  } catch (error) {
    console.error('Error generando certificado:', error.message);
    return null;
  }
};

module.exports = { generarBibYPostal, asignarBibNumber, generarCertificado };