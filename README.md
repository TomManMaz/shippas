# shippas

Dashboard privata dei progressi (peso, dieta, allenamenti) per il personal trainer.
I dati in `data.enc.json` sono cifrati (AES-GCM, chiave da password via PBKDF2) e vengono
decifrati solo nel browser. Li aggiorna ogni giorno `fitness/scripts/dashboard_export.py`.
