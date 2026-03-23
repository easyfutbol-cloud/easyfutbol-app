import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const sections = [
  {
    title: 'Responsable del tratamiento',
    paragraphs: [
      'EASYFUTBOL E.S.P.J. es el responsable del tratamiento de los datos personales del usuario, de conformidad con el Reglamento (UE) 2016/679, de 27 de abril (RGPD), y la Ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD).',
      'Datos de contacto: EASYFUTBOL E.S.P.J., C/ Emilia Pardo Bazán, 5 Bajo Dcha, 47007 Valladolid (Valladolid), España. Email: easyfutbol@easyfutbol.es.',
    ],
  },
  {
    title: 'Finalidad del tratamiento',
    paragraphs: [
      'Tratamos sus datos personales para gestionar el registro de usuarios, permitir el acceso a la cuenta personal, administrar la participación en partidos y eventos organizados por EasyFutbol, gestionar pagos o saldo interno cuando resulte aplicable, enviar comunicaciones relacionadas con el servicio, atender solicitudes o incidencias y garantizar el correcto funcionamiento, mantenimiento y seguridad de la aplicación.',
      'Podrán tratarse datos identificativos y de contacto, como nombre, correo electrónico, contraseña cifrada, información de perfil, historial de participación en eventos, datos necesarios para la gestión de inscripciones, saldo o créditos de usuario y, en su caso, datos técnicos del dispositivo o de uso de la aplicación necesarios para fines de seguridad, mantenimiento y mejora del servicio.',
    ],
  },
  {
    title: 'Base jurídica',
    paragraphs: [
      'El tratamiento de sus datos está legitimado por la ejecución de la relación contractual derivada del uso de la aplicación y de la aceptación de sus términos y condiciones.',
      'También podrá basarse en el consentimiento del usuario para uno o varios fines específicos y en el interés legítimo de EASYFUTBOL E.S.P.J. para atender encargos, solicitudes e incidencias realizadas a través de la aplicación.',
    ],
  },
  {
    title: 'Conservación de los datos',
    paragraphs: [
      'Los datos personales se conservarán durante el tiempo necesario para cumplir con la finalidad del tratamiento y, mientras exista relación contractual, durante los plazos legales de conservación y prescripción que resulten aplicables.',
      'Una vez dejen de ser necesarios, se suprimirán aplicando las medidas de seguridad adecuadas para garantizar su anonimización o destrucción.',
    ],
  },
  {
    title: 'Destinatarios de los datos',
    paragraphs: [
      'Los datos personales podrán comunicarse a las Administraciones Públicas y a otras entidades cuando sea necesario para el cumplimiento de obligaciones legales.',
      'Asimismo, podrán acceder a los datos determinados proveedores contratados por EASYFUTBOL E.S.P.J. para la prestación de servicios vinculados al funcionamiento de la aplicación, la página web o el correo electrónico. Con todos ellos se suscriben los contratos de confidencialidad y encargo de tratamiento exigidos por la normativa vigente.',
      'En caso de acceso mediante proveedores externos de autenticación, como Google, el tratamiento se realizará conforme a las condiciones de uso y políticas de privacidad del proveedor correspondiente.',
      'La aplicación puede utilizar herramientas de analítica para conocer el uso y las tendencias de interacción, pudiendo tratar información disociada o no identificativa con fines estadísticos y de mejora del servicio.',
    ],
  },
  {
    title: 'Permisos de la aplicación',
    paragraphs: [
      'La aplicación podrá solicitar permisos de acceso a Internet, envío de notificaciones, cámara y/o galería de imágenes del dispositivo, exclusivamente para permitir el correcto funcionamiento del servicio, el acceso a contenidos actualizados, el envío de recordatorios o comunicaciones relacionadas con los partidos y la posible subida de imágenes por parte del usuario.',
      'Con carácter general, estos permisos solo se utilizarán cuando el usuario interactúe con la aplicación o cuando la funcionalidad correspondiente lo requiera. El usuario puede conceder o revocar los permisos en cualquier momento desde los ajustes de su dispositivo.',
    ],
  },
  {
    title: 'Derechos del usuario',
    paragraphs: [
      'El usuario puede retirar su consentimiento en cualquier momento cuando el tratamiento se base en el mismo.',
      'También puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad de sus datos.',
      'Si considera que el tratamiento no se ajusta a la normativa vigente, puede presentar una reclamación ante la Agencia Española de Protección de Datos a través de www.aepd.es.',
      'Para ejercer sus derechos, puede contactar con EASYFUTBOL E.S.P.J. en easyfutbol@easyfutbol.es.',
    ],
  },
  {
    title: 'Medidas de seguridad',
    paragraphs: [
      'EASYFUTBOL E.S.P.J. manifiesta que aplica las medidas técnicas y organizativas apropiadas para garantizar un nivel de seguridad adecuado al riesgo, de acuerdo con el RGPD y la LOPDGDD.',
      'Las comunicaciones entre la aplicación y los servidores se realizan mediante conexiones cifradas HTTPS. Las contraseñas no se almacenan en texto plano, sino mediante mecanismos de cifrado o hash adecuados, y el acceso administrativo a los sistemas se encuentra restringido.',
      'Para más información sobre privacidad y seguridad, puede contactar con EASYFUTBOL E.S.P.J. en easyfutbol@easyfutbol.es.',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Política de Privacidad</Text>

          <Text style={styles.intro}>
            En esta sección se informa al usuario sobre el tratamiento de sus datos personales en el uso de la aplicación móvil EasyFutbol.
          </Text>

          {sections.map((section) => (
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