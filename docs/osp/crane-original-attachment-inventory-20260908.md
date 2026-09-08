# Crane original attachment inventory

Downloaded read-only from Sales Gmail connector into
`tmp/crane-original-mail-20260908/`. Original files remain untracked/private;
no upload, conversion, macro execution, signature or delivery occurred.
All seven byte lengths match Gmail attachment metadata. SHA256 calculated
locally after download; provider did not supply independent hashes.

Original message: 19ce39a524507c5b. Amendment: 19d211f61ba8e86a.

| Form | Bytes | SHA256 |
| --- | ---: | --- |
| QF-147 DOCX | 167154 | be10c97a46c936138bd34188cd938eb2b50262719e352d53de466a6974b6b47f |
| QF-050 DOCX | 1105686 | d3f726e35fe99c3fad1381e6ae3dae85c502329da9345a19a295578fd9645a29 |
| QF-169 DOCX | 153489 | 6c8946f64dba36b545928bd64b3e5bc68f8fbb80928edde0dedec9e9f9f6b39c |
| QF-248 DOCX | 77660 | 2f469c7f2761bc48f86c9833cb9ec17c4da9efb6b7c4c91e42e93adea0ee4220 |
| QF-154 DOCX | 180929 | f77f9dfa3675d4313b94d00e467d973ace59ff39318b20288628a2580d7785a8 |
| QF-168 DOCX, superseded | 69040 | a39ff50d6c65da645348e8e864f010dad3ee26c7ac85e8da04c2aa2bed77bace |
| QF-167 DOC, amendment | 745472 | eb94d7c68f8ecad92a8edb07f6ac9ded4c508cc8ad1b7b1bdc2f83fc4f560707 |

The explicit amendment replaces QF-168 with QF-167. Retaining QF-168 is audit
preservation, not approval to include it in the final package. Local Drive filled
copies are separate artifacts and must not replace this original inventory.
Full visual inspection, governed source binding and completed outputs remain
pending. No production case was changed.

## Read-only OOXML inspection

The six original DOCX ZIP containers were inspected without launching Office or
extracting/executing embedded objects. QF-050 contains
`word/embeddings/oleObject1.bin` and `word/embeddings/oleObject2.bin`.
QF-154 contains two external relationships of type hyperlink. The remaining
four DOCX containers have no matching VBA/embedding/ActiveX entries or external
relationships in this structural check. No links were followed.

This is not an antivirus verdict or a safe-source approval. The embedded objects
were not classified. Conversion must disable active content and preserve the
originals; determine whether these objects carry required document content before
sanitizing, rather than silently dropping a requirement. Legacy QF-167 DOC was
not covered by this OOXML check. No safety status was changed in Supabase.

Further read-only XML inspection identifies both QF-050 objects as
`ProgID=Acrobat.Document.DC`, `Type=Embed`, `DrawAspect=Icon`, linked by rId11
and rId13 to the two embedded binaries. They occur adjacent to a paragraph
requiring the representative to review the Company's Code of Business Conduct
and Antibribery Policies and Procedures. This is a declaration/context finding,
not confirmation of either binary's actual content or safety. Preserve both
objects and inspect their extracted content before concluding the package is
complete. A PDF render displaying only icons would not establish that the
embedded policies were reviewed or delivered. No policy was accepted.
