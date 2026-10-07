import LegalDocument from '../components/LegalDocument';
import { PRIVACIDAD } from '../content/legal';
export default function PrivacidadScreen({ onVolver }) {
  return <LegalDocument title="Tu privacidad" sections={PRIVACIDAD} onBack={onVolver} />;
}
