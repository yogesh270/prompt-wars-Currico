---
name: grill-me
description: Use before writing any code in a vibe-coding session where the user hasn't fully specified intent — whether that's a whole new project or a single small feature/tweak (e.g. "add a button that does X", "make this field validate"). Grills the user with a tight, one-shot set of clarifying questions scaled to the size of the ask, before picking anything unilaterally — tech stack, architecture, behavior on edge cases, styling, error handling, etc. Trigger for "build/create/make/scaffold/start" requests, small feature or UI-element requests that have unstated behavior, or when the user explicitly says "grill me". Also trigger mid-build whenever a new non-trivial decision point comes up that wasn't already covered — ask only that gap, not the whole checklist again.
---

# Vibe Grill

Purpose: stop the agent from silently guessing on decisions the user actually has an opinion about. Ask first, build second. Scale the questioning to the size of the ask — a button gets 2-3 questions, a new project gets up to 7.

## Step 1: size the request

- **New project / major feature** (new app, new screen, new service, "start building X") → run the **Full Grill**.
- **Small feature / single component / tweak** (a button, a form field, a validation rule, "make X do Y") → run the **Quick Grill**.
- If genuinely unclear which size it is, default to Quick Grill and expand only if the answers reveal more scope than expected.

Either way: skip any item the user's message already answered. Ask what's left in ONE batch, as short bullet questions — never one at a time, never as prose paragraphs.

## Full Grill (new project / major feature)

1. **Core goal** — what is this for, who uses it?
2. **Platform** — web, mobile, CLI, API, desktop?
3. **Stack constraints** — required or forbidden languages/frameworks/services?
4. **Must-haves vs out-of-scope** — minimum that must work, and what to explicitly NOT build even if related?
5. **Starting point** — brand new, or existing code/repo to work from?
6. **Non-functional constraints** — auth, data persistence, deployment target, scale, deadline (only ask ones that plausibly apply)?
7. **Definition of done** — how will the user know it's finished/working?

## Quick Grill (small feature / single component)

Pick only the questions that are actually ambiguous for this specific ask — usually 2-4:

1. **Trigger/behavior** — what exactly happens on the action (click, submit, load)? Any state change, navigation, or data write?
2. **Edge cases** — what should happen on error, empty input, double-click, slow network, or the "nothing to show" case?
3. **Look/placement** — where does it live, does it match existing style, any specific label/copy/icon?
4. **Scope boundary** — anything nearby that looks related but should NOT be touched?

Skip any of these that are obvious from context (e.g. a delete button's edge case is usually "confirm before deleting" — only ask if it's genuinely unclear).

Prefer short option buttons (e.g. `ask_user_input_v0` or equivalent) where a small fixed set of choices exists. Use free text only for open-ended items (goal, must-haves, copy).

## After answers come in

Restate the locked decisions as a compact spec, not a document, and get a quick confirm before writing any code. Scale the spec to match:

> Full: Building: [goal]. Stack: [x]. In scope: [a, b]. Out of scope: [c]. Done when: [criteria].
> Quick: [Feature] does [behavior] on [trigger]; handles [edge case] by [x]; lives at [location].

## Lock-in rule

Once confirmed, treat these as fixed. Do not re-ask the same questions later in the session.

## Mid-build gaps

If a new non-trivial choice comes up later that wasn't covered (a library pick, a data model shape, an API contract, an unhandled edge case), ask ONLY that specific question, briefly. Do not re-run the full checklist.

## Anti-patterns — never do these

- Running the Full Grill on a small feature/tweak, or vice versa.
- Asking more than ~7 questions for a project, or more than ~4 for a small feature.
- Asking about anything the user already specified.
- Asking one question, waiting, then asking the next, instead of batching.
- Picking a stack, library, architecture, or edge-case behavior silently on a non-trivial call and mentioning it only after the fact.
- Continuing to grill after lock-in instead of moving to building.