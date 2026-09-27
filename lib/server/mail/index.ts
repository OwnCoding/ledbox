export {
  MAIL_CATEGORIES,
  sendMail,
  type MailActor,
  type MailCategory,
  type SendMailInput,
  type SendMailResult,
} from "./send";
export { appEmailSender, emailConfigured, missingApiKeyMessage } from "./transport";
export {
  mailLogoUrl,
  renderMail,
  renderMailText,
  type MailContent,
  type MailCta,
  type MailRow,
} from "./template";
export {
  buildBudgetMail,
  budgetPrintSheetUrl,
  type BudgetMailBudget,
  type BudgetMailContent,
  type BudgetMailInput,
  type BudgetMailItem,
} from "./budget";
export {
  buildInvitationMail,
  type InvitationMailContent,
  type InvitationMailInput,
} from "./invitation";
export {
  buildSignatureCompletedMail,
  buildSignatureOtpMail,
  buildSignatureRequestMail,
  type SignatureCompletedMailInput,
  type SignatureOtpMailInput,
  type SignatureRequestMailContent,
  type SignatureRequestMailInput,
} from "./signature";
