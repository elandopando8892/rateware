import type { ArtifactReviewField } from '../features/review/artifact-review';

// Fictitious field inventory. Not Salzillo's map, a request review, or business data.
export const syntheticArtifactInventory: readonly ArtifactReviewField[] = Object.freeze([
  { id: 'company.name', label: 'Razón social mexicana completa', sourceLocation: 'Formulario ficticio · sección 1', allowNotApplicable: false },
  { id: 'company.rfc', label: 'RFC de la entidad mexicana', sourceLocation: 'Formulario ficticio · sección 1', allowNotApplicable: false },
  { id: 'references.first', label: 'Referencia 1: empresa, contacto, teléfono y correo', sourceLocation: 'Formulario ficticio · sección 2', allowNotApplicable: false },
  { id: 'references.second', label: 'Referencia 2: empresa, contacto, teléfono y correo', sourceLocation: 'Formulario ficticio · sección 2', allowNotApplicable: false },
  { id: 'references.third', label: 'Referencia 3: empresa, contacto, teléfono y correo', sourceLocation: 'Formulario ficticio · sección 2', allowNotApplicable: false },
  { id: 'references.fourth', label: 'Cuarta referencia opcional', sourceLocation: 'Formulario ficticio · sección 2', allowNotApplicable: true },
]);
