# Figma Getting Started For Ledger Mockups

Last reviewed: 2026-04-06

This note captures recommended beginner resources and a practical fast-start sequence for producing implementation-ready ledger mockups.

## Recommended Resources

- Figma Design for Beginners (2025 course):
  - https://help.figma.com/hc/en-us/articles/30848209492887-Course-overview-Figma-Design-for-beginners-2025
- Figma Get Started learning hub:
  - https://help.figma.com/hc/en-us/categories/360002051613
- Figma Design documentation:
  - https://help.figma.com/hc/en-us/categories/360002042553-Figma-Design
- Components guide:
  - https://help.figma.com/hc/en-us/articles/360038662654-Guide-to-components-in-Figma
- Figma Learn home:
  - https://help.figma.com/hc/en-us
- Figma Resource Library, Getting started in design:
  - https://www.figma.com/resource-library/getting-started-in-design/
- Figma YouTube intro video (links to course):
  - https://www.youtube.com/watch?v=TxvFTg1jpI0

## Fast Start Path

1. Complete the Figma Design for Beginners (2025) course.
2. Focus next on `Auto layout`, `Components`, and `Variants`.
3. Build the ledger mockup using naming and export rules in:
   - [docs/ui-mockups/ledger/README.md](/Users/robert/Projects/gnucash-ng/docs/ui-mockups/ledger/README.md)
4. Export required PNG frames into `docs/ui-mockups/ledger/`.
5. Fill in behavioral sections in the ledger handoff README:
   - keyboard map
   - inline edit rules
   - split editor rules
   - error/recovery behavior
6. Mark non-negotiables explicitly:
   - add at least 3 items under `Must Match Exactly`
   - add at least 3 items under `Implementation Can Approximate`

## Definition Of Ready For Implementation

A mockup handoff is ready when all of the following are true:

- required frames are exported and named as specified
- interaction semantics are fully defined
- keyboard behavior is fully mapped
- responsive behavior is specified for 1440, 1200, and 1024 widths
- visual tokens are listed clearly enough for CSS translation
- open design questions are tracked in one place
