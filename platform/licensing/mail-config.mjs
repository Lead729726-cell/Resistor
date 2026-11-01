import {createResendMailer} from './mail.mjs';
import {createGmailMailer} from './gmail.mjs';

// Secret presence is configuration, never evidence of a verified sender domain
// or a functioning purchase integration. Optional mail errors cannot take the
// existing signing/activation authority offline.
export function configureLicenseMail(env,{fetchImpl=fetch}={}){
 const requested=env.LICENSE_MAIL_SENDING_ENABLED==='true';
 const provider=['resend','gmail'].includes(env.LICENSE_MAIL_PROVIDER)?env.LICENSE_MAIL_PROVIDER:null;
 const credentialsConfigured=provider==='gmail'?!!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REFRESH_TOKEN):!!env.RESEND_API_KEY;
 const dailyAttemptLimit=env.LICENSE_MAIL_DAILY_ATTEMPT_LIMIT===undefined?80:Number(env.LICENSE_MAIL_DAILY_ATTEMPT_LIMIT);
 let mailer,smokeMailer,configurationError=null;
 if(requested||provider==='gmail'){
  if(!provider)configurationError='provider_not_configured';
  else if(!credentialsConfigured||!env.LICENSE_MAIL_FROM||(provider==='gmail'&&!env.GMAIL_SENDER_EMAIL))configurationError='sender_or_credentials_missing';
  else if(!Number.isInteger(dailyAttemptLimit)||dailyAttemptLimit<1||dailyAttemptLimit>100)configurationError='daily_attempt_limit_invalid';
  else try{const transport=provider==='gmail'?createGmailMailer({clientId:env.GMAIL_CLIENT_ID,clientSecret:env.GMAIL_CLIENT_SECRET,refreshToken:env.GMAIL_REFRESH_TOKEN,from:env.LICENSE_MAIL_FROM,senderEmail:env.GMAIL_SENDER_EMAIL,fetchImpl}):createResendMailer({apiKey:env.RESEND_API_KEY,from:env.LICENSE_MAIL_FROM,fetchImpl});if(requested)mailer=transport;if(provider==='gmail')smokeMailer=transport;}catch{configurationError='mail_configuration_invalid';}
 }
 return {mailer,smokeMailer,dailyAttemptLimit:mailer||smokeMailer?dailyAttemptLimit:80,readiness:{provider,sending_requested:requested,sending_enabled:!!mailer,sender_configured:!!env.LICENSE_MAIL_FROM,credentials_configured:credentialsConfigured,webhook_signature_configured:!!env.RESEND_WEBHOOK_SECRET,delivery_event_support:provider==='gmail'?'not_available_with_send_only_scope':'signed_resend_webhook_when_configured',scheduled_sender_enabled:!!mailer,configuration_error:configurationError,order_ingestion:'operator_verified_only',inflearn_webhook:'not_connected',inflearn_course_bound:/^\d{1,20}$/.test(env.LICENSE_INFLEARN_COURSE_ID??''),provider_connection_verified:false}};
}
