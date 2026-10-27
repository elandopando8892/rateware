# Consulta completa de campañas por RFx · ENG-FLOW-01

Candidato local preparado 26/oct/2026 sobre las 36 fuentes activas de API719, hash 09125a5979aa8dcfd1ae4a9d17d66402aff8b9a6363c37ccaab758a90e372b57. No desplegado.

list_outreach_campaigns con rfx_event_id valida propietario/evento/organización y devuelve versión1, complete, total y scope. Lee campañas no archivadas por ID, 250 por página, máximo5,000; verifica conteo exacto al inicio de cada una de dos pasadas y compara campos. Un fallo, recorte o cambio devuelve409 sin rows. RFx inválido400; ajeno/ausente404. Sin rfx_event_id conserva el bloque legacy y sus contadores. Lectura consultiva: no es snapshot transaccional ni garantía de estabilidad posterior/ABA.

La conciliación de Git preserva una integración MarkOS que ya estaba activa y un salto de línea histórico de rfx-rfi-link, sin alterar su lógica. El parche funcional modifica sólo index.ts y outreach-pagination.js. Para recuperación de producción usar las36fuentes API719 anteriores; la reversión funcional en Git debe conservar la conciliación MarkOS. No usar como rollback operativo la inversa de conciliación a un Git que carecía de esas fuentes.

Evidencia local: 25 casos de consulta, 15 de integración con cliente, 49 pruebas de conciliación, 8 del lector compartido, 1 de selección y20escenarios de navegador. BD sintética; se bloquearon escrituras e internet de las pruebas. Fuentes, pruebas, manifiesto e inversas están en el paquete privado engine-flow-campaigns-20261026. Publicar primero API, verificar lectura real completa por RFx y sólo entonces frontend. No migraciones, envíos, membresías, ofertas ni adjudicaciones.
