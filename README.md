# Integración BigQuery para VIN Offers

Este backend expone un endpoint `GET /api/ofertas?vin=...` que consulta BigQuery:
`base-maestra-gn.Ofertas_Comerciales.vin_ofertas_consolidado` y devuelve:
- `oferta_principal`
- `ofertas` (excluyendo duplicado con principal)

## Ejecutar en local

1. `npm install`
2. Autenticación:
   - O bien `export GOOGLE_APPLICATION_CREDENTIALS=/ruta/cred.json`
   - El service account necesita el rol **BigQuery Data Viewer** (y acceso al dataset).
3. `npm run dev` y prueba: `http://localhost:8080/api/ofertas?vin=ABCDEFGH12345678`

## Despliegue recomendado
- **Cloud Run** (node 20) o **Cloud Functions 2nd gen** con Workload Identity.
- Variables: ninguna obligatoria (PORT auto).

## Frontend
El `script.js` hace `fetch('/api/ofertas?vin=...')`. Si sirves frontend por otro dominio, configura CORS.
