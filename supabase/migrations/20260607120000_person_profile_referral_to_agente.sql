-- Renombrar perfil CRM «referral» a «agente» (etiqueta en app: Agente).
UPDATE public."PersonProfile"
SET profile = 'agente'
WHERE profile = 'referral';
