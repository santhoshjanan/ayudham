# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Greenfield. The repository has no code, no commits, and no chosen stack yet. There are no build, lint, or test commands — add them here (including how to run a single test) as soon as the toolchain is decided. Do not assume a framework, package manager, or hosting target; those are outputs of the brainstorming/spec step.

## What this is

A "swiss-army knife" suite of small team tools. The first app is an interactive, realtime (WebSocket) planning poker tool.

Reference products for the first app — similar to, but not limited to:

- https://planningpokeronline.com/
- https://www.scrumpoker-online.org/en/features/

Because this is a suite, structural decisions made for planning poker (repo layout, shared UI/design tokens, realtime transport, auth/identity, deployment) should be made with a second and third app in mind rather than baked into the poker app.

## Non-negotiable: security and privacy

Security and privacy are of paramount importance and outrank feature scope and delivery speed. Treat them as design inputs from the first spec, not a hardening pass at the end:

- Every spec and plan must state its data-collection, retention, and trust-boundary decisions explicitly (what is stored, where, for how long, who can read it).
- Default to collecting and persisting the minimum needed; any new piece of user data, third-party script, analytics, or external service needs to be called out to the user for a decision, not added silently.
- Realtime messages from clients are untrusted input: authorize and validate server-side per message, not only at connection time.

## Workflow: which toolset owns what

The user has assigned each phase of work to a specific plugin. Follow this division rather than mixing them:

| Phase | Owner | How |
|---|---|---|
| Planning and execution | Superpowers | `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:executing-plans` / `superpowers:subagent-driven-development`, with `superpowers:test-driven-development` and `superpowers:verification-before-completion` |
| UX and UI direction | Impeccable | `impeccable` skill (and the `impeccable-*` agents) for design direction, critique, polish, accessibility |
| Review | Octopus | `octo:*` reviewers — notably `octo:skills:octopus-code-review` and `octo:skills:octopus-security-audit` |

Notes:

- Octopus agents are meant to be started only when a review is explicitly called for; use them at review checkpoints, not for implementation.
- Given the security/privacy priority, a review of anything touching realtime transport, session/room access, identity, or stored data should include the Octopus security audit, not only the general code review.
