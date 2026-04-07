---
name: github-roadmap
description: Route ideas and work into the correct GitHub issue, milestone, and roadmap project shape for this repository.
---

# GitHub Roadmap

Use this plugin for GitHub project-management work in this repo:

- create or refine roadmap-ready issues
- triage rough ideas into `idea`, roadmap, or current-work follow-up
- keep labels, milestones, and project placement aligned
- maintain parent and child issue relationships
- keep the GitHub project board synchronized with actual execution issues

## Routing Rules

Default routing:

- rough or exploratory work -> `idea` issue only
- execution-ready planned work -> roadmap issue with milestone and project placement
- bugs -> bug issue template
- internal cleanup -> refactor issue template
- work required to finish the current branch correctly -> keep it with the current branch or create a follow-up issue if it is clearly separate

## Repo-Specific Rules

- `idea` issues should not get a milestone yet
- `idea` issues should not be added to the `Tally Roadmap` project yet
- roadmap work should use the roadmap issue template
- roadmap child issues should be added to the roadmap project and assigned to the correct phase milestone
- parent issues should explicitly point to child execution issues
- small admin or documentation-only changes may go directly to `main`
- docs or admin changes tied to a major feature should stay with that feature branch

## Promotion Bar

Promote an idea to roadmap work only when:

1. the outcome is clear enough to execute
2. the rough implementation area is known
3. it can be prioritized against current roadmap work
4. someone is ready to work it in the near term

If any of these are missing, keep it in the idea inbox.

## Weekly Maintenance

At least once a week:

- review new `idea` issues
- promote, park, or close ideas
- re-rank roadmap work
- make sure new execution issues are on the roadmap project
- fix label, milestone, or parent-child drift

## Helper Script

This plugin includes `scripts/issue-routing-checklist.sh`:

- `zsh plugins/github-roadmap/scripts/issue-routing-checklist.sh`
- `zsh plugins/github-roadmap/scripts/issue-routing-checklist.sh idea`
- `zsh plugins/github-roadmap/scripts/issue-routing-checklist.sh roadmap`
- `zsh plugins/github-roadmap/scripts/issue-routing-checklist.sh branch`
