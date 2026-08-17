import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ru from './locales/ru';
import es from './locales/es';
import de from './locales/de';
import fr from './locales/fr';
import pt from './locales/pt';
import zh from './locales/zh';

const resources = { en, ru, es, de, fr, pt, zh };

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});
export default i18n;
