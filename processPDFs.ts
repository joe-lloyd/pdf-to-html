import fs from "fs";
import PDFParser, { Page } from "pdf2json";
import express, { Express } from "express";

const app: Express = express();
const port: number = 3000;

const inputDir: string = "./input";
const outputDir: string = "./output";

fs.readdir(inputDir, (err, files) => {
  if (err) throw err;

  files.filter(file => file.endsWith(".pdf")).forEach(file => {
    const filePath = `${inputDir}/${file}`;
    processPDF(filePath, file);
  });
});

function generateHtmlFromPage(page: Page, pageIndex: number): string {
  let contentBlocks: string[] = [];
  let currentBlock: string[] = [];
  let blockType: "p" | "ol" | "ul" = "p"; // Track the current block type
  let insideListItem = false; // Track whether we are processing text inside a list item

  const titleFontSizeThreshold = 20; // Example threshold for titles
  const listIndentThreshold = 10; // Indentation threshold to consider as list item, adjust based on your data
  const orderedListPattern = /^\d+\./; // Matches "1.", "2.", etc.
  const unorderedListPattern = /^[\u25A0\u25CF\u2022\+]/; // Matches "■", "●", "•", and "+"

  // Helper function to finalize the current block and start a new one if necessary
  const finalizeBlock = () => {
    if (currentBlock.length > 0) {
      if (blockType === "p") {
        contentBlocks.push(`<p>${currentBlock.join(" ")}</p>`);
      } else if (blockType === "ol" || blockType === "ul") {
        const tag = blockType === "ol" ? "ol" : "ul";
        contentBlocks.push(`<${tag}>${currentBlock.join("")}</${tag}>`);
      }
      currentBlock = [];
    }
    insideListItem = false; // Resetting the insideListItem flag
  };

  page.Texts.forEach((textItem, index) => {
    // Decode the text content
    const textContent = textItem.R.map(textRun => decodeURIComponent(textRun.T)).join("");

    // Extract styling
    const color = textItem.oc || "#000"; // Default color
    const fontSize = Math.max(textItem.R[0].TS[1], 16);
    const fontWeight = textItem.R[0].TS[3] === 1 ? "bold" : "normal";
    const alignment = textItem.A;
    const style = `color: ${color}; font-size: ${fontSize}px; font-weight: ${fontWeight}; text-align: ${alignment};`;

    // Check if the text is a title
    if (fontSize >= titleFontSizeThreshold) {
      finalizeBlock();
      contentBlocks.push(`<h2 style="${style}">${textContent}</h2>`); // Using <h2> for titles, adjust as needed
      blockType = "p";
      return;
    }

    // Detect list items based on patterns
    const trimmedText = textContent.trim();
    const isOrderedListItem = orderedListPattern.test(trimmedText);
    const isUnorderedListItem = unorderedListPattern.test(trimmedText);

    if (isOrderedListItem || isUnorderedListItem) {
      if (blockType !== "ol" && isOrderedListItem) {
        finalizeBlock();
        blockType = "ol";
      } else if (blockType !== "ul" && isUnorderedListItem) {
        finalizeBlock();
        blockType = "ul";
      }
      // Mark that we're inside a list item
      insideListItem = true;
      // Prepare list item text, removing the bullet/marker
      const listItemText = trimmedText.replace(orderedListPattern, "").replace(unorderedListPattern, "").trim();
      currentBlock.push(`<li style="${style}">${listItemText}</li>`);
    } else if (insideListItem) {
      // We're still in a list item, so append the text to the last <li>
      const lastItemIndex = currentBlock.length - 1;
      currentBlock[lastItemIndex] = currentBlock[lastItemIndex].replace("</li>", ` ${textContent}</li>`);
    } else {
      // Normal text outside of a list
      if (blockType !== "p") {
        finalizeBlock();
        blockType = "p";
      }
      currentBlock.push(`<span style="${style}">${textContent}</span>`);
    }
  });

  finalizeBlock(); // Finalize the last block

  return `
  <div class="page" style="max-width: 700px; margin: 20px auto 50px; text-align: left;">
    ${contentBlocks.join('\n')}
    <div class="page-header" style="font-size: 20px; margin-bottom: 20px; text-align: center;">
      Page ${pageIndex + 1}
    </div>
  </div>`;
}

async function processPDF(filePath: string, fileName: string) {
  const pdfParser = new PDFParser();

  pdfParser.on("pdfParser_dataError", errData => console.error(errData));
  pdfParser.on("pdfParser_dataReady", async pdfData => {
    console.log(`Processing ${fileName}...`);

    // Generate HTML for pages
    const pagesHtml = pdfData.Pages.map((page, index) => {
      if (index === 2) {
        console.log(JSON.stringify(page));
      }
      return generateHtmlFromPage(page, index);
    }).join("");

    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Converted PDF</title>
            <style>
                body { font-family: Arial, sans-serif; }
                .page { margin-bottom: 20px; }
                .text { margin: 0; }
            </style>
        </head>
        <body>
            ${pagesHtml}
        </body>
        </html>
        `;

    fs.writeFileSync(`${outputDir}/${fileName}.html`, htmlContent);
    console.log(`Finished writing ${fileName}`);
  });

  await pdfParser.loadPDF(filePath);
}

// Serve files
app.use(express.static(outputDir));

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
