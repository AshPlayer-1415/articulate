# Context, caching and evidence

Historical analysis is experimental. The default explicit engine extracts literal
requests; processing counts also include assistant and tool records. They do not
establish semantic understanding or verified preferences. Shared analysis reports
user-event coverage separately. Only reviewed rules reach personalization.

Model analysis uses bounded UTF-8 windows with overlapping segments for long
messages. Every retained eligible code point is represented; evidence identities
remain unique within a window. This input byte budget is not a tokenizer count or
a guarantee of model comprehension. Ollama requests 32,768 context tokens and
2,048 output tokens; memory use and model support must be checked on the device.
An incomplete/length-limited response is refused. No automatic model fallback.

Window-local short references reduce citation copying errors. Both model and
cached contracts are checked against the exact evidence/project scope. Ordinary
tasks without explicit durable-preference language cannot become lasting rules
merely because the model cited them. This conservative screen can miss implicit
preferences and does not prove that a proposal is correct or useful. Review is
mandatory; historical data never grants permissions or overrides a current task.
Imported rules about host permissions, credentials, cross-session authority or
host configuration are withheld rather than treated as collaboration preferences.

Validated window results are cached locally. Retry after a later-window failure
reuses completed work; the event cursor moves only after the entire batch succeeds.
Cache identity includes extraction version, engine, configured model name,
endpoint and the scoped evidence content. Changing content, model name, endpoint
or the model extraction version invalidates reuse. API credentials are excluded.
Changing weights behind an unchanged model alias is not detected automatically;
use a distinct model identifier for a different analysis model. The explicit
engine keeps its existing cache/cursor namespace for this upgrade.

These caches are analysis results, separate from a model runtime's KV/prompt
cache. Neither token savings nor human learning gains are inferred from them.
Raw history remains local unless the person separately opts into an explicitly
configured remote analysis provider. MCP exposes reviewed preferences and derived
coverage, not imported transcripts. Client permissions are checked on retrieval;
never use cached policies to bypass revocation or a new task's instructions.

Regression coverage includes Unicode/tail preservation, interrupted-window retry,
content/model/endpoint invalidation, cached injection/foreign evidence refusal,
ordinary-task rejection and incomplete Ollama output. New platform results must
be checked for the candidate; an older release's green CI is not current proof.
