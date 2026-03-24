import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

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

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Texto legal</Text>
          <Text style={styles.intro}>
            A continuación se muestra el texto completo de términos y condiciones de uso y política de privacidad de la aplicación EasyFutbol.
          </Text>

          {legalSections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={`${section.title}-${index}`} style={styles.text}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  intro: {
    fontSize: 15,
    lineHeight: 24,
    color: '#ddd',
    marginBottom: 18,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
    color: '#ddd',
    marginBottom: 10,
  },
});