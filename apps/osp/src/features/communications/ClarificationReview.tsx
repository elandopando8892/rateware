import { useState } from 'react';

export type ClarificationReviewDraft = {
  canonicalSha256: string;
  authorizationMailbox: 'sales@heymarksman.com';
  status: 'operations_review_required' | 'operations_reviewed';
  questions: readonly { kind: 'missing' | 'contradiction'; fieldId: string; question: string; evidenceIds: readonly string[] }[];
};
export type ClarificationReviewSubmission = {
  expectedCanonicalSha256: string;
  questions: ClarificationReviewDraft['questions'];
};

export function ClarificationReview({ draft, onSaveReview }: {
  draft: ClarificationReviewDraft;
  onSaveReview(input: ClarificationReviewSubmission): void | Promise<void>;
}) {
  const [questions, setQuestions] = useState(() => draft.questions.map((question) => ({ ...question, evidenceIds: [...question.evidenceIds] })));
  const [edited, setEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const update = (index: number, value: string) => {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, question: value } : question));
    setEdited(true);
    setSaved(false);
    setSaveFailed(false);
  };
  const save = async () => {
    if (questions.some((question) => question.question.trim().length < 3)) return;
    setSaveFailed(false);
    try {
      await onSaveReview({ expectedCanonicalSha256: draft.canonicalSha256, questions });
      setSaved(true);
    } catch {
      setSaved(false);
      setSaveFailed(true);
    }
  };
  if (draft.status === 'operations_reviewed') {
    return <section aria-labelledby="clarification-review-title">
      <h1 id="clarification-review-title">Clarification review</h1>
      <p role="status">The Operations review is immutable. Any external authorization remains separate and must come from <strong>{draft.authorizationMailbox}</strong>.</p>
      <ol>{draft.questions.map((question) => <li key={question.fieldId}><strong>{question.fieldId}</strong>: {question.question}<p>Evidence: {question.evidenceIds.join(', ')}</p></li>)}</ol>
    </section>;
  }
  return <section aria-labelledby="clarification-review-title">
    <h1 id="clarification-review-title">Clarification review</h1>
    <p>Operations reviews every cited question. External authorization remains separate and must come from <strong>{draft.authorizationMailbox}</strong>.</p>
    {saveFailed ? <p role="alert">We could not save the Operations review. Please retry.</p> : edited ? <p role="status">Edits require a new Sales authorization before any later delivery.</p> : saved ? <p role="status">Operations review saved.</p> : null}
    <ol>
      {questions.map((question, index) => <li key={question.fieldId}>
        <label htmlFor={`clarification-${index}`}>Question for {question.fieldId}</label>
        <textarea id={`clarification-${index}`} value={question.question} onChange={(event) => update(index, event.target.value)} />
        <p>Evidence: {question.evidenceIds.join(', ')}</p>
      </li>)}
    </ol>
    <button type="button" onClick={() => { void save(); }}>Save Operations review</button>
  </section>;
}
