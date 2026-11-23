# Numbered practice booklet

Run `npm run example` to regenerate seven artifacts:

- `numbered-practice.pdf`: ten original numbered pages, with top/bottom orientation labels.
- `booklet.pdf`: actual imposed PDF, six landscape sides / three physical sheets.
- `settings.json`: settings only; no source PDF bytes.
- `receipt.json`: complete source fingerprint, page boxes, ordering, placements and audit.
- `order.csv`: all six sides.
- `guide.html`: standalone setup guidance and complete order diagram.
- `order-map.svg`: generated numbered mapping, not a render of PDF artwork.

With an eight-page signature limit, the first signature is 1–8 on two sheets. The second is 9–10 plus two added blank panels on one sheet.

The first side is 8 / 1; the second is 2 / 7. All six imposed sides were rendered and visually inspected with Poppler. This is a digital rendering check, not proof of physical duplex, printer settings or folding.
