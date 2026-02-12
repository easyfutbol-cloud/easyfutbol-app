const SibApiV3Sdk = require('@getbrevo/brevo');

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

apiInstance.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: {
        email: "no-reply@easyfutbol.es",
        name: "EasyFutbol"
      },
      to: [{ email: to }],
      subject,
      htmlContent
    });
  } catch (error) {
    console.error("Error enviando email:", error);
  }
};

module.exports = sendEmail;