# Vigencia en lecturas de tarifas · corrección local

## Problema, reutilización y alternativas

El piloto del 1 de octubre guarda valid_through=2026-10-07 en rate_staging,
pero Revisión muestra «—». El componente ya renderiza `row.valid_through`;
las listas de columnas de rateware-api omiten el campo. La fecha de vigencia
ya existe en el esquema (verificada por SELECT); no hace falta migración.

Se reutiliza el benchmark y arquitectura del plan de cierre operativo de
Bidware: frontend React/Vite, API compartida y fuentes de verdad existentes.

| Alternativa | Ajuste, costo y riesgo | Decisión |
|---|---|---|
| Incluir el campo persistido en las proyecciones existentes | Contrato aditivo, sin dependencia/licencia nueva, conserva owner_email y permisos | Recomendada |
| Extraer una fecha de notes desde el cliente | Ahorra un cambio backend pero depende de texto libre y puede mostrar una fecha incorrecta | Descartada |
| Leer la tabla directamente desde Bidware | Duplica lecturas y su modelo de permisos; más mantenimiento | Descartada |

## Alcance y aceptación

La columna de Vigencia y el diseño existentes mostrarán la fecha del backend;
si no existe, conservarán «—». Se añade valid_through solo a la lista y al
detalle de filas. No se cambia ni rellena retroactivamente el dato, su parsing,
precios, estado, adjudicación, reglas de aprobación o envío.

El contrato de las tres lecturas list_staging, list_rateware y
list_rateware_rows_by_ids debe conservar la fecha y null, excluir filas de otro
workspace y no escribir. La prueba usa el handler real con tablas aisladas
que aplican la proyección de columnas. Se comprueba el fallo antes del arreglo.

Base: d5bdb7df, correspondiente a rateware-api 679. Trabajo local y lineal en
el checkout de recuperación; no se crea rama, PR, infraestructura o preview.
No se despliega rfx-bid-api desde este checkout: su runtime es más reciente.

Recomendación de ejecución: Sol, esfuerzo medio para el contrato; sin cambio
de modelo ni medición fiable de tokens/costo. El ajuste tiene dos campos de
proyección y una prueba focalizada, sin repetir toda la batería sin motivo.

## Límites y siguiente comprobación

La aprobación al Tarifario, archivo de la captura inicial y puntos de cruce
no forman parte del arreglo. El dato ficticio continúa pendiente y sin validez
comercial. Después de una publicación autorizada habrá que verificar una
lectura autenticada real y la fecha visible tras recarga; las pruebas locales
no se presentan como un despliegue ni aceptación productiva.

## Resultado local

Los tres contratos de lectura fallaron antes del arreglo porque devolvían
undefined en lugar de fecha/null. Después pasan: 3 contratos de lectura más
34 guardas de aprobación, 37 pruebas con chequeo de tipos Deno. Se ejecutaron
con --no-lock y --node-modules-dir=none; ningún manifiesto o lockfile cambió.
El diff del handler solo añade valid_through en dos proyecciones.
No está publicado ni desplegado: producción continúa en rateware-api 679.
