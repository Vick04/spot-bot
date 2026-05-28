const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, BorderStyle, WidthType, ShadingType } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function createTable(rows) {
  const colCount = rows[0].length;
  const colWidth = Math.floor(9360 / colCount);
  
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(colWidth),
    rows: [
      new TableRow({
        children: rows[0].map(text => new TableCell({
          borders, width: { size: colWidth, type: WidthType.DXA },
          shading: { fill: "2E75B6", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF" })] })]
        }))
      }),
      ...rows.slice(1).map(row => new TableRow({
        children: row.map(text => new TableCell({
          borders, width: { size: colWidth, type: WidthType.DXA },
          shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun(text)] })]
        }))
      }))
    ]
  });
}

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("OrderObserver Specification")] }),
      new Paragraph({ children: [new TextRun("")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1. VARIABLES CONFIGURABLES (por símbolo)")] }),
      createTable([
        ["Variable", "Tipo", "Significado", "Ejemplo"],
        ["downCond2", "number", "% bajo ma99 para DOWN", "0.970"],
        ["upCond2", "number", "% sobre ma99 para UP", "1.018"],
        ["downSell", "number", "Take profit DOWN", "1.009"],
        ["upSell", "number", "Take profit UP", "1.010"]
      ]),
      new Paragraph({ children: [new TextRun("")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2. VARIABLES CALCULADAS")] }),
      createTable([
        ["Variable", "Origen", "Período", "Uso"],
        ["ma20", "CryptoObserver", "20 candles", "Velocidad de cambio"],
        ["ma99", "CryptoObserver", "99 candles", "Tendencia general"],
        ["bbUpper", "CryptoObserver", "20 período", "Banda superior"],
        ["bbLower", "CryptoObserver", "20 período", "Banda inferior"],
        ["close", "CryptoObserver", "Vela actual", "Precio cierre"]
      ]),
      new Paragraph({ children: [new TextRun("")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3. VARIABLES DE ESTADO")] }),
      createTable([
        ["Variable", "Tipo", "Valores Posibles", "Descripción"],
        ["symbol", "string", "BTCUSDT, etc.", "Símbolo asignado"],
        ["estado", "string", "WAITING/BOUGHT/SOLD", "Estado actual"],
        ["buyPrice", "number", "0.0 - ∞", "Precio de compra"],
        ["buyStrategy", "string", "DOWN/UP/null", "Estrategia ejecutada"],
        ["currentPrice", "number", "0.0 - ∞", "Precio actual"]
      ]),
      new Paragraph({ children: [new TextRun("")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4. VARIABLES VISIBLES PARA MANAGER")] }),
      createTable([
        ["Variable", "Tipo", "Descripción"],
        ["canBuyDOWN", "boolean", "¿Condiciones DOWN cumplidas?"],
        ["canBuyUP", "boolean", "¿Condiciones UP cumplidas y sin streak?"],
        ["shouldSell", "boolean", "¿Alcanzó target de ganancia?"],
        ["pnlPercent", "number", "% Ganancia/pérdida actual"],
        ["gainer1h", "number", "% cambio última hora"]
      ])
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("OrderObserver_Specification.docx", buffer);
  console.log("✅ Documento creado: OrderObserver_Specification.docx");
});
