# UX and design system

The dashboard uses an airy operational workspace: neutral `#F5F7F9`, primary `#1F6F7A`, blue `#27658A`, and state colors that always include text/icon cues. The supplied AnyTech logo is displayed with its intrinsic proportions.

Angular Material supplies accessible interaction primitives. Tailwind is available for future layout utilities; product-specific visual language lives in component CSS. System fonts avoid a blocking external font request and include Arabic-capable fallbacks.

Core rules:

- Minimum 320 px viewport, desktop sidebar, compact mobile header, and single-column cards on narrow screens.
- Visible focus rings, skip link, semantic headings/lists/tables, labelled icon buttons, and logical reading order.
- CSS logical properties permit RTL without duplicate layouts. Identifiers remain directionally stable where appropriate.
- Status always has text; pending, failed and unknown provider states must remain distinct.
- Animation is limited to transforms and opacity and respects reduced-motion preferences.
- French is the initial UI copy. A production translation catalogue and Arabic text review are required before pilot.

