// App.js
import React, { useEffect, useState } from 'react';
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { api } from './src/api/client';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import AccessScreen from './src/screens/AccessScreen';
import MatchScreen from './src/screens/MatchScreen';
import MatchsScreen from './src/screens/MatchsScreen';
import MyMatchesScreen from './src/screens/MyMatchesScreen';
import StatsScreen from './src/screens/StatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminCreateMatchScreen from './src/screens/AdminCreateMatchScreen';
import AdminMatchStatsScreen from './src/screens/AdminMatchStatsScreen';
import AdminMatchesScreen from './src/screens/AdminMatchesScreen';
import AdminMatchEditScreen from './src/screens/AdminMatchEditScreen';
import AdminNotifyScreen from './src/screens/AdminNotifyScreen';
import AdminEasyPassScreen from './src/screens/admineasypassscreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import EasyPassScreen from './src/screens/EasyPassScreen';
import AchievementsScreen from './src/screens/AchievementsScreen';
import LeaguesHomeScreen from './src/screens/leagues/LeaguesHomeScreen';
import JoinLeagueScreen from './src/screens/leagues/JoinLeagueScreen';
import LeagueCalendarScreen from './src/screens/leagues/LeagueCalendarScreen';
import MyTeamScreen from './src/screens/leagues/MyTeamScreen';
import LeagueVideosScreen from './src/screens/leagues/LeagueVideosScreen';
import LeagueStatsScreen from './src/screens/leagues/LeagueStatsScreen';
import LeagueStandingsScreen from './src/screens/leagues/LeagueStandingsScreen';
import LeagueInfoScreen from './src/screens/leagues/LeagueInfoScreen';
import WorldCupScreen from './src/screens/worldcup/WorldCupScreen';
import WorldCupSelectTeamScreen from './src/screens/worldcup/WorldCupSelectTeamScreen';

// Notificaciones (opcional)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {}

const Stack = createNativeStackNavigator();
const ORANGE = '#ff5a00';

// Tema oscuro sin barra superior por defecto
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#0b0b0d' },
};

// === Navigation Ref para navegar desde fuera de las screens ===
export const navigationRef = createNavigationContainerRef();

// === Controlador global para abrir/cerrar el menú desde cualquier screen ===
export const menuController = { open: () => {}, close: () => {} };

function normalizeVersion(version) {
  return String(version || '0')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isVersionLower(currentVersion, minVersion) {
  const current = normalizeVersion(currentVersion);
  const minimum = normalizeVersion(minVersion);
  const maxLength = Math.max(current.length, minimum.length);

  for (let i = 0; i < maxLength; i += 1) {
    const currentPart = current[i] || 0;
    const minimumPart = minimum[i] || 0;

    if (currentPart < minimumPart) return true;
    if (currentPart > minimumPart) return false;
  }

  return false;
}

async function checkMinimumAppVersion() {
  try {
    const currentVersion = Application?.nativeApplicationVersion || '0.0.0';
    const res = await api.get('/app-config/min-version');
    const config = res?.data || {};
    const minVersion = config?.minVersion || '0.0.0';

    return {
      needsUpdate: isVersionLower(currentVersion, minVersion),
      currentVersion,
      minVersion,
      message:
        config?.message ||
        'Hay una nueva versión disponible. Actualiza EasyFutbol para continuar.',
      storeUrl: Platform.OS === 'ios' ? config?.iosUrl : config?.androidUrl,
    };
  } catch (error) {
    console.log('check minimum app version error:', error?.message || error);
    return { needsUpdate: false };
  }
}

function ForceUpdateScreen({ data }) {
  const storeUrl = data?.storeUrl;

  const openStore = async () => {
    try {
      if (storeUrl) {
        await Linking.openURL(storeUrl);
      }
    } catch (error) {
      console.log('open store error:', error?.message || error);
      // eslint-disable-next-line no-alert
      alert('No se pudo abrir la tienda. Busca EasyFutbol en App Store o Google Play.');
    }
  };

  return (
    <View style={forceUpdateStyles.container}>
      <View style={forceUpdateStyles.card}>
        <Text style={forceUpdateStyles.badge}>Nueva versión</Text>
        <Text style={forceUpdateStyles.title}>Actualiza la app</Text>
        <Text style={forceUpdateStyles.text}>
          {data?.message ||
            'Hay una nueva versión disponible. Actualiza EasyFutbol para continuar.'}
        </Text>

        <TouchableOpacity style={forceUpdateStyles.button} onPress={openStore} activeOpacity={0.85}>
          <Text style={forceUpdateStyles.buttonText}>Actualizar ahora</Text>
        </TouchableOpacity>

        <Text style={forceUpdateStyles.footer}>
          Versión instalada: {data?.currentVersion || '-'} · Versión mínima: {data?.minVersion || '-'}
        </Text>
      </View>
    </View>
  );
}

function VerifyEmailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const extraTop = 8;

  const emailFromRoute = route?.params?.email || '';
  const [email, setEmail] = useState(String(emailFromRoute));
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Mantén el prefijo /api si tu backend está montado bajo /api
  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

  const submitVerify = async () => {
    try {
      const em = String(email || '').trim().toLowerCase();
      const c = String(code || '').trim();
      if (!em) throw new Error('Introduce tu email');
      if (!c) throw new Error('Introduce el código');

      setLoading(true);
      const res = await fetch(`${BASE}/auth/email/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: em, code: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      navigation.navigate('Access', { prefill: { identifier: em } });
    } catch (e) {
      console.log('verify email error:', e?.message);
      // eslint-disable-next-line no-alert
      alert(e?.message || 'No se pudo verificar');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const em = String(email || '').trim().toLowerCase();
      if (!em) throw new Error('Introduce tu email');

      setLoading(true);
      const res = await fetch(`${BASE}/auth/email/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: em }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      // eslint-disable-next-line no-alert
      alert('Código reenviado. Mira tu correo.');
    } catch (e) {
      console.log('resend email error:', e?.message);
      // eslint-disable-next-line no-alert
      alert(e?.message || 'No se pudo reenviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + extraTop,
          justifyContent: 'center',
          backgroundColor: '#0b0b0d',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 }}>
          Verifica tu correo
        </Text>
        <Text style={{ color: '#bbb', marginBottom: 18 }}>
          Te hemos enviado un código de 6 dígitos. Introdúcelo para poder apuntarte y pagar.
        </Text>

        <Text style={{ color: '#ccc', marginBottom: 6 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor="#777"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
          style={{
            backgroundColor: '#111',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: '#fff',
            marginBottom: 12,
          }}
        />

        <Text style={{ color: '#ccc', marginBottom: 6 }}>Código</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#777"
          keyboardType="number-pad"
          editable={!loading}
          style={{
            backgroundColor: '#111',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: '#fff',
          }}
        />

        <TouchableOpacity
          onPress={submitVerify}
          disabled={loading}
          style={{
            marginTop: 16,
            backgroundColor: ORANGE,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={resend}
          disabled={loading}
          style={{
            marginTop: 10,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Reenviar código</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Access', { prefill: { identifier: email } })}
          disabled={loading}
          style={{ marginTop: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#bbb' }}>Volver a iniciar sesión</Text>
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
}

function PrivacyPolicyScreen() {
  const legalSections = [
    {
      title: 'TÉRMINOS Y CONDICIONES DE USO DE LA APLICACIÓN',
      paragraphs: [
        'Estos Términos y Condiciones regulan la descarga, acceso y utilización de la aplicación móvil EasyFutbol APP (en adelante, la «APLICACIÓN»), que EASYFUTBOL E.S.P.J. pone a disposición de los usuarios. El usuario adquiere esta condición con la descarga y uso de la misma.',
        'Esta versión de la APLICACIÓN está disponible de forma gratuita en Google Play y Apple Store, el usuario reconoce y acepta cumplir con todos los términos y condiciones aplicables respecto a la obtención, descarga y actualización de la APLICACIÓN que estos stores respectivamente determinen.',
        'El acceso a la APLICACIÓN supone que el usuario reconoce haber aceptado y consentido sin reservas las presentes condiciones de uso.',
      ],
    },
    {
      title: '1. OBJETO',
      paragraphs: [
        'La APLICACIÓN tiene por objeto permitir a los usuarios consultar, reservar y gestionar su participación en partidos y eventos deportivos organizados por EasyFutbol, así como acceder a su perfil de usuario, historial de participación, sistema de saldo o créditos de juego, comunicaciones relacionadas con los eventos y demás funcionalidades vinculadas a la actividad de la plataforma.',
        'La aplicación va dirigida principalmente a jugadores aficionados al fútbol, usuarios interesados en participar en partidos organizados, administradores o responsables de gestión de eventos deportivos y, en general, personas mayores de edad interesadas en los servicios ofrecidos por EasyFutbol.',
        'En el diseño y desarrollo de esta APLICACIÓN han intervenido profesionales especialistas, así como un grupo de usuarios que participaron en el período de prueba.',
        'La APLICACIÓN se pone a disposición de los usuarios para su uso personal (nunca empresarial). Funciona en un teléfono móvil con sistema operativo Android o IOS y con cámara frontal.',
      ],
    },
    {
      title: '2. FUNCIONALIDADES',
      paragraphs: [
        'Para usuarios registrados: registro e inicio de sesión, gestión del perfil de usuario, consulta de partidos disponibles, inscripción en partidos, visualización de plazas disponibles, consulta de eventos en los que el usuario está inscrito, gestión de saldo o créditos de juego, acceso a notificaciones y, en su caso, funcionalidades específicas para usuarios con rol de administrador, como consulta de listados de inscritos y gestión de eventos.',
      ],
    },
    {
      title: 'Permisos solicitados por la aplicación',
      paragraphs: [
        'La aplicación podrá solicitar, en función de las funcionalidades utilizadas por el usuario, permisos de acceso a Internet, envío de notificaciones, cámara y/o galería de imágenes del dispositivo. Estos permisos se solicitan exclusivamente para permitir el correcto funcionamiento de la aplicación, como el acceso a contenidos actualizados, el envío de recordatorios o comunicaciones relacionadas con los partidos, y la posible subida de imágenes por parte del usuario.',
      ],
    },
    {
      title: 'Alcance del tratamiento',
      paragraphs: [
        'Con carácter general, los permisos se utilizarán únicamente cuando el usuario interactúe con la aplicación en primer plano. En caso de que alguna funcionalidad requiera un tratamiento adicional, ello se informará específicamente al usuario antes de su activación.',
      ],
    },
    {
      title: 'Gestión y revocación de permisos',
      paragraphs: [
        'El usuario podrá conceder o revocar en cualquier momento los permisos otorgados a la aplicación desde los ajustes de su dispositivo móvil, dentro del apartado correspondiente a la gestión de permisos de la aplicación.',
      ],
    },
    {
      title: '3. DERECHOS DE PROPIEDAD INTELECTUAL E INDUSTRIAL',
      paragraphs: [
        'Los derechos de propiedad intelectual e industrial sobre la APLICACIÓN son titularidad de EASYFUTBOL E.S.P.J., correspondiéndole el ejercicio exclusivo de los derechos de explotación de los mismos en cualquier forma y, en especial, los derechos de reproducción, distribución, comunicación pública y transformación.',
        'Los terceros titulares de derechos de propiedad intelectual e industrial sobre fotografías, logotipos, y cualesquiera otros símbolos o contenidos incluidos en la APLICACIÓN han concedido las correspondientes autorizaciones para su reproducción, distribución y puesta a disposición del público.',
        'El usuario reconoce que la reproducción, modificación, distribución, comercialización, descompilación, desensamblado, utilización de técnicas de ingeniería inversa o de cualquier otro medio para obtener el código fuente, transformación o publicación de cualquier resultado de pruebas de referencias no autorizadas de cualquiera de los elementos y utilidades integradas dentro del desarrollo constituye una infracción de los derechos de propiedad intelectual de EASYFUTBOL E.S.P.J., obligándose, en consecuencia, a no realizar ninguna de las acciones mencionadas.',
      ],
    },
    {
      title: '4. POLÍTICA DE PRIVACIDAD',
      paragraphs: [
        '¿Quién es el responsable del tratamiento de sus datos personales?',
        'EASYFUTBOL E.S.P.J. es el responsable del tratamiento de los datos personales del usuario y le informa de que estos datos serán tratados de conformidad con lo dispuesto en el Reglamento (UE) 2016/679, de 27 de abril (RGPD), y la Ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD), por lo que se le facilita la siguiente información del tratamiento:',
        '¿Para qué tratamos sus datos personales?',
        'Tratamos sus datos personales para las finalidades descritas en el apartado «1. OBJETO» de estos términos y condiciones, esto es, gestionar el registro de usuarios, permitir el acceso a la cuenta personal, administrar la participación en partidos y eventos organizados por EasyFutbol, gestionar pagos o saldo interno cuando resulte aplicable, enviar comunicaciones relacionadas con el servicio, atender solicitudes o incidencias y garantizar el correcto funcionamiento, mantenimiento y seguridad de la aplicación.',
        'Incluyendo, entre otros, información sobre: podrán tratarse datos identificativos y de contacto, como nombre, correo electrónico, contraseña cifrada, información de perfil, historial de participación en eventos, datos necesarios para la gestión de inscripciones, saldo o créditos de usuario y, en su caso, datos técnicos del dispositivo o de uso de la aplicación necesarios para fines de seguridad, mantenimiento y mejora del servicio.',
        '¿Por qué motivo podemos tratar sus datos personales?',
        'El tratamiento de sus datos está legitimado con base en: ser necesario para la relación contractual, de la que usted es parte, que supone la aceptación de estos términos y condiciones de uso (art. 6.1.b RGPD); su consentimiento otorgado para uno o varios fines específicos (artículo 6.1.a RGPD) al cumplimentar cualquiera de los formularios y/o formas de contacto que ponemos a su disposición en esta APLICACIÓN y marcar la casilla habilitada para tal efecto; y nuestro interés legítimo en el caso de dar respuesta a sus encargos o solicitudes realizadas a través de cualquiera de los formularios y/o formas de contacto que ponemos a su disposición en la APLICACIÓN (artículo 6.1.f RGPD).',
        '¿Durante cuánto tiempo guardaremos sus datos personales?',
        'Conservaremos sus datos personales durante no más tiempo del necesario para mantener el fin del tratamiento, es decir, mientras dure la relación contractual objeto del uso de la APLICACIÓN, incluyendo la obligación de conservarlos durante los plazos de prescripción aplicables, y cuando ya no sean necesarios para tal fin, se suprimirán con medidas de seguridad adecuadas para garantizar la anonimización o la destrucción total de los mismos.',
        '¿A quién facilitamos sus datos personales?',
        'Sus datos personales se comunicarán a las Administraciones Públicas y otras entidades privadas para el cumplimiento de las obligaciones legales a las que EASYFUTBOL E.S.P.J. está sujeto por sus actividades.',
        'También podrán comunicarse a los proveedores que precisen acceder a los datos personales del usuario para la prestación de los servicios que EASYFUTBOL E.S.P.J. les haya contratado, o que por el propio funcionamiento de los servicios electrónicos, aplicación, página web y correos electrónicos, puedan tener acceso a determinados datos personales. Con todos ellos EASYFUTBOL E.S.P.J. tiene suscritos los contratos de confidencialidad y de encargo de tratamiento de datos personales necesarios y exigidos por la normativa para proteger su privacidad (artículo 28.3 RGPD).',
        'El registro y el control de sesiones de usuario se realiza mediante la infraestructura propia de EASYFUTBOL E.S.P.J., a través de sus servidores y sistemas de autenticación.',
        'En caso de acceso mediante proveedores externos de autenticación, como Google, el tratamiento se realizará conforme a las condiciones de uso y políticas de privacidad del proveedor correspondiente.',
        'La APLICACIÓN utilizará Google Analytics como herramienta para conocer el uso y las tendencias de interacción de la misma. EASYFUTBOL E.S.P.J. podrá utilizar la información personal que nos facilite de forma disociada, sin identificación personal, para fines internos, tales como la elaboración de estadísticas.',
        'La APLICACIÓN podrá recabar, almacenar o acumular determinada información de carácter no personal referente a su uso. Google Analytics se rige por las condiciones generales de Google accesibles en http://www.google.com/analytics/terms/es.html y las políticas de privacidad de Google accesibles en https://www.google.es/intl/es/policies/privacy/.',
        '¿Cuáles son los derechos que le asisten como usuario?',
        'Derecho a retirar el consentimiento en cualquier momento.',
        'Derecho de acceso, rectificación, portabilidad y supresión de sus datos, y de limitación u oposición a su tratamiento.',
        'Derecho a presentar una reclamación ante la autoridad de control (www.aepd.es) si considera que el tratamiento no se ajusta a la normativa vigente.',
        'Datos de contacto para ejercer sus derechos: EASYFUTBOL E.S.P.J., C/ Emilia Pardo Bazán, 5 Bajo Dcha - 47007 Valladolid (Valladolid). E-mail: easyfutbol@easyfutbol.es.',
      ],
    },
    {
      title: '5. CARÁCTER OBLIGATORIO O FACULTATIVO DE LA INFORMACIÓN FACILITADA POR EL USUARIO',
      paragraphs: [
        'Los usuarios, mediante la marcación de las casillas correspondientes y entrada de datos en los campos marcados con un asterisco (*) en los formularios de la APLICACIÓN, aceptan expresamente y de forma libre e inequívoca que sus datos personales son necesarios para atender su petición por parte del prestador, siendo voluntaria la inclusión de datos en los campos restantes. El usuario garantiza que los datos personales facilitados a EASYFUTBOL E.S.P.J. son veraces y se hace responsable de comunicar cualquier modificación de los mismos.',
        'EASYFUTBOL E.S.P.J. informa de que todos los datos solicitados a través de la APLICACIÓN son obligatorios, ya que son necesarios para la prestación de un servicio óptimo al Usuario. En caso de que no se faciliten todos los datos, no se garantiza que la información y servicios facilitados sean completamente ajustados a sus necesidades.',
      ],
    },
    {
      title: '6. MEDIDAS DE SEGURIDAD',
      paragraphs: [
        'De conformidad con lo dispuesto en las normativas vigentes en protección de datos personales, el RESPONSABLE está cumpliendo con todas las disposiciones de las normativas RGPD y LOPDGDD para el tratamiento de los datos personales de su responsabilidad, y manifiestamente con los principios descritos en el artículo 5 del RGPD, por los cuales son tratados de manera lícita, leal y transparente en relación con el interesado y adecuados, pertinentes y limitados a lo necesario en relación con los fines para los que son tratados.',
        'EASYFUTBOL E.S.P.J. garantiza que ha implementado políticas técnicas y organizativas apropiadas para aplicar las medidas de seguridad que establecen el RGPD y la LOPDGDD con el fin de proteger los derechos y libertades de los usuarios y les ha comunicado la información adecuada para que puedan ejercerlos.',
        'Toda transferencia de información que la APLICACIÓN realiza con servidores en la nube, propios o de terceros, se realiza de manera cifrada y segura a través de un protocolo seguro de transferencia de hipertexto (HTTPS), que además garantiza que la información no pueda ser interceptada.',
        'La aplicación se comunica con los servidores mediante conexiones cifradas HTTPS. EASYFUTBOL E.S.P.J. adopta medidas técnicas y organizativas razonables para proteger la información personal frente a accesos no autorizados, pérdida, alteración o divulgación indebida. Las contraseñas de usuario no se almacenan en texto plano, sino mediante mecanismos de cifrado o hash adecuados. El acceso administrativo a los sistemas se encuentra restringido.',
        'Para más información sobre las garantías de privacidad y seguridad, puede contactar con EASYFUTBOL E.S.P.J. en el correo electrónico: easyfutbol@easyfutbol.es.',
      ],
    },
    {
      title: '7. EXCLUSIÓN DE RESPONSABILIDAD',
      paragraphs: [
        'EASYFUTBOL E.S.P.J. se reserva el derecho de editar, actualizar, modificar, suspender, eliminar o finalizar los servicios ofrecidos por la APLICACIÓN, incluyendo todo o parte de su contenido, sin necesidad de previo aviso, así como de modificar la forma o tipo de acceso a esta.',
        'Las posibles causas de modificación pueden tener lugar por motivos tales como su adaptación a las posibles novedades legislativas y cambios en la propia APLICACIÓN, así como a las que se puedan derivar de los códigos tipos existentes en la materia o por motivos estratégicos o corporativos.',
        'EASYFUTBOL E.S.P.J. no será responsable del uso de la APLICACIÓN por un menor de edad, siendo la descarga y uso de la APLICACIÓN exclusiva responsabilidad del usuario.',
        'La APLICACIÓN se presta «tal y como es» y sin ninguna clase de garantía. EASYFUTBOL E.S.P.J. no se hace responsable de la calidad final de la APLICACIÓN, ni de que esta sirva y cumpla con todos los objetivos de la misma. No obstante lo anterior, EASYFUTBOL E.S.P.J. se compromete en la medida de sus posibilidades a contribuir en la mejora de la calidad de la APLICACIÓN, pero no puede garantizar la precisión ni la actualidad del contenido de la misma.',
        'La responsabilidad de uso de la APLICACIÓN corresponde solo al usuario. Salvo lo establecido en estos Términos y Condiciones, EASYFUTBOL E.S.P.J. no es responsable de ninguna pérdida o daño que se produzca en relación con la descarga o el uso de la APLICACIÓN, tales como los producidos a consecuencia de fallos, averías o bloqueos en el funcionamiento de la APLICACIÓN, por ejemplo y sin carácter limitativo: error en las líneas de comunicaciones, defectos en el hardware o software de la APLICACIÓN o fallos en la red de Internet. Igualmente, EASYFUTBOL E.S.P.J. tampoco será responsable de los daños producidos a consecuencia de un uso indebido o inadecuado de la APLICACIÓN por parte de los usuarios.',
      ],
    },
    {
      title: '8. LEGISLACIÓN Y FUERO',
      paragraphs: [
        'El usuario acepta que la legislación aplicable y los Juzgados y Tribunales competentes para conocer de las divergencias derivadas de la interpretación o aplicación de este clausulado son los españoles, y se somete, con renuncia expresa a cualquier otro fuero, a los juzgados y tribunales más cercanos a la ciudad de Valladolid.',
        'He leído y acepto las condiciones de uso de la APLICACIÓN.',
      ],
    },
  ];

  return (
    <View style={privacyStyles.container}>
      <ScrollView contentContainerStyle={privacyStyles.content} showsVerticalScrollIndicator={false}>
        <Text style={privacyStyles.title}>Texto legal</Text>
        <Text style={privacyStyles.intro}>
          A continuación se muestra el texto completo de términos y condiciones de uso y política de privacidad de la aplicación EasyFutbol.
        </Text>

        {legalSections.map((section) => (
          <View key={section.title} style={privacyStyles.section}>
            <Text style={privacyStyles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={`${section.title}-${index}`} style={privacyStyles.text}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// --- Botón + Menú hamburguesa persistente (arriba derecha) ---
function AppMenu({ currentRouteName }) {
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  // Exponer controlador global
  useEffect(() => {
    menuController.open = () => setOpen(true);
    menuController.close = () => setOpen(false);
    return () => {
      menuController.open = () => {};
      menuController.close = () => {};
    };
  }, []);

  // Carga/refresh de sesión
  const refreshAuth = async () => {
    try {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) {
        setIsLogged(false);
        setIsAdmin(false);
        return;
      }
      const user = JSON.parse(raw);
      const admin =
        user?.role === 'admin' ||
        user?.is_admin === true ||
        (Array.isArray(user?.permissions) && user.permissions.includes('admin'));
      setIsLogged(true);
      setIsAdmin(!!admin);
    } catch {
      setIsLogged(false);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, [currentRouteName]); // refresca al cambiar de ruta

  // En Access y VerifyEmail no mostramos ni botón ni modal
  if (currentRouteName === 'Access' || currentRouteName === 'VerifyEmail') return null;

  const baseItems = [
    { label: 'Inicio', screen: 'Home' },
    { label: 'Partidos', screen: 'Matchs' },
    { label: 'Mis Partidos', screen: 'MyMatches' },
    { label: 'Ligas', screen: 'LeaguesHome' },
    { label: 'Mundial EasyFutbol', screen: 'WorldCup' },
    { label: 'Estadísticas', screen: 'Stats' },
    { label: 'Perfil', screen: 'Profile' },
  ];

  const adminItems = [
    { label: 'Dashboard KPIs (Admin)', screen: 'AdminDashboard' },
    { label: 'Administrar Partidos (Admin)', screen: 'AdminMatches' },
    { label: 'Crear Partido (Admin)', screen: 'AdminCreateMatch' },
    { label: 'Stats Partido (Admin)', screen: 'AdminMatchStats' },
    { label: 'Avisos (Admin)', screen: 'AdminNotify' },
    { label: 'Control de EasyPass (Admin)', screen: 'AdminEasyPass' },
  ];

  const goTo = (screen) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(screen);
    }
  };

  return (
    <>
      {/* Botón flotante: oculto en Home para que no tape el avatar */}
      {currentRouteName !== 'Home' && (
        <View
          pointerEvents="box-none"
          style={[
            styles.menuBtnWrapper,
            { top: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 8 },
          ]}
        >
          <TouchableOpacity
            accessibilityLabel="Abrir menú de navegación"
            onPress={() => setOpen(true)}
            style={styles.menuBtn}
            activeOpacity={0.85}
          >
            <View style={styles.bar} />
            <View style={[styles.bar, { width: 14 }]} />
            <View style={[styles.bar, { width: 10 }]} />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal del menú (se puede abrir también desde el avatar de Home) */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.panel,
              { marginTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 8 },
            ]}
          >
            <Text style={styles.panelTitle}>Navegación</Text>

            {baseItems.map((it) => (
              <Pressable key={it.screen} onPress={() => goTo(it.screen)} style={styles.item}>
                <Text style={styles.itemText}>{it.label}</Text>
              </Pressable>
            ))}

            {isAdmin && (
              <>
                <View style={styles.sectionTag}>
                  <Text style={styles.sectionTagText}>ADMIN</Text>
                </View>
                {adminItems.map((it) => (
                  <Pressable key={it.screen} onPress={() => goTo(it.screen)} style={styles.item}>
                    <Text style={styles.itemText}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            )}

            <View style={styles.divider} />
            {!isLogged && (
              <Pressable onPress={() => goTo('Access')} style={styles.item}>
                <Text style={styles.itemText}>Iniciar sesión / Acceso</Text>
              </Pressable>
            )}

            <View style={styles.menuFooter}>
              <Pressable onPress={() => goTo('PrivacyPolicy')} hitSlop={8}>
                <Text style={styles.privacyLink}>Política de privacidad</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function AppShell({ currentRouteName }) {
  const insets = useSafeAreaInsets();
  const extraTop = 8;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#0b0b0d',
            paddingTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + extraTop,
          },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Access" component={AccessScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="Match" component={MatchScreen} />
        <Stack.Screen name="Matchs" component={MatchsScreen} />
        <Stack.Screen name="MyMatches" component={MyMatchesScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="LeaguesHome" component={LeaguesHomeScreen} options={{ title: 'Ligas' }} />
        <Stack.Screen name="JoinLeague" component={JoinLeagueScreen} options={{ title: 'Mi invitación' }} />
        <Stack.Screen name="LeagueCalendar" component={LeagueCalendarScreen} options={{ title: 'Calendario' }} />
        <Stack.Screen name="MyTeam" component={MyTeamScreen} options={{ title: 'Mi equipo' }} />
        <Stack.Screen name="LeagueVideos" component={LeagueVideosScreen} options={{ title: 'Vídeos' }} />
        <Stack.Screen name="LeagueStats" component={LeagueStatsScreen} options={{ title: 'Estadísticas' }} />
        <Stack.Screen name="LeagueStandings" component={LeagueStandingsScreen} options={{ title: 'Clasificación' }} />
        <Stack.Screen name="LeagueInfo" component={LeagueInfoScreen} options={{ title: 'Funcionamiento' }} />
        <Stack.Screen name="WorldCup" component={WorldCupScreen} />
        <Stack.Screen name="WorldCupSelectTeam" component={WorldCupSelectTeamScreen} />
        <Stack.Screen name="Achievements" component={AchievementsScreen} />
        <Stack.Screen name="EasyPass" component={EasyPassScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="AdminMatches" component={AdminMatchesScreen} />
        <Stack.Screen name="AdminMatchEdit" component={AdminMatchEditScreen} />
        <Stack.Screen name="AdminCreateMatch" component={AdminCreateMatchScreen} />
        <Stack.Screen name="AdminMatchStats" component={AdminMatchStatsScreen} />
        <Stack.Screen name="AdminNotify" component={AdminNotifyScreen} />
        <Stack.Screen name="AdminEasyPass" component={AdminEasyPassScreen} />
      </Stack.Navigator>

      <AppMenu currentRouteName={currentRouteName} />
    </View>
  );
}

export default function App() {
  const [currentRouteName, setCurrentRouteName] = useState(null);
  const [checkingVersion, setCheckingVersion] = useState(true);
  const [forceUpdateData, setForceUpdateData] = useState(null);

  useEffect(() => {
    let mounted = true;

    const runVersionCheck = async () => {
      const result = await checkMinimumAppVersion();

      if (!mounted) return;

      if (result?.needsUpdate) {
        setForceUpdateData(result);
      }

      setCheckingVersion(false);
    };

    runVersionCheck();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!Notifications) return;
    const subReceived = Notifications.addNotificationReceivedListener(() => {});
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      // navegar según data
    });
    return () => {
      subReceived?.remove?.();
      subResponse?.remove?.();
    };
  }, []);

  if (checkingVersion) {
    return (
      <SafeAreaProvider>
        <View style={forceUpdateStyles.loadingContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={forceUpdateStyles.loadingText}>Cargando EasyFutbol...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (forceUpdateData) {
    return (
      <SafeAreaProvider>
        <ForceUpdateScreen data={forceUpdateData} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={navTheme}
        ref={navigationRef}
        onReady={() => {
          const route = navigationRef.getCurrentRoute();
          setCurrentRouteName(route?.name ?? null);
        }}
        onStateChange={() => {
          const route = navigationRef.getCurrentRoute();
          setCurrentRouteName(route?.name ?? null);
        }}
      >
        <AppShell currentRouteName={currentRouteName} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  menuBtnWrapper: {
    position: 'absolute',
    right: 12,
    zIndex: 1000,
  },
  menuBtn: {
    width: 40,
    height: 40,
    backgroundColor: ORANGE,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  bar: {
    width: 18,
    height: 2,
    backgroundColor: '#0b0b0d',
    borderRadius: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
  },
  panel: {
    width: 260,
    marginRight: 10,
    backgroundColor: '#131316',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  panelTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
    opacity: 0.9,
  },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,90,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTagText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  item: {
    paddingVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  itemText: {
    color: '#fff',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  menuFooter: {
    marginTop: 8,
    paddingTop: 8,
    alignItems: 'center',
  },
  privacyLink: {
    color: '#9a9aa0',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

const privacyStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0d',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 16,
  },
  intro: {
    color: '#d0d0d0',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 18,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10,
  },
  text: {
    color: '#d0d0d0',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
});

const forceUpdateStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0b0b0d',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#cfcfcf',
    fontSize: 15,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: '#0b0b0d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    backgroundColor: '#131316',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.6)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  badge: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  text: {
    color: '#d0d0d0',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 22,
  },
  button: {
    width: '100%',
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 14,
  },
  buttonText: {
    color: '#0b0b0d',
    fontSize: 16,
    fontWeight: '900',
  },
  footer: {
    color: '#8f8f95',
    fontSize: 12,
    textAlign: 'center',
  },
});