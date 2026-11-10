// Testa as contas da calculadora (script.js) sem navegador.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = source.indexOf("/* ---------- Calculadora ---------- */");
const end = source.indexOf("/* ---------- Confirmações ---------- */");
assert.ok(start > 0 && end > start, "bloco da calculadora encontrado no script.js");
const block = source.slice(start, end);
// O bloco inclui a ligação com os botões da tela; os testes cuidam só das contas.
const interactivityStart = block.indexOf("// Deixa a calculadora testável");
const calculatorSource = interactivityStart > 0 ? block.slice(0, interactivityStart) : block;

const file = path.join(os.tmpdir(), `calculadora-${process.pid}.js`);
const stub = "const document = { querySelector: () => null };\n";
fs.writeFileSync(file, `${stub}${calculatorSource}\nmodule.exports = { calculator, calcFormat, calcDigit, calcOperator, calcEquals, calcPercent, calcClear, calcBackspace };\n`);
const calc = require(file);

function press(sequence) {
  for (const key of sequence) {
    if (key === "C") calc.calcClear();
    else if (key === "%") calc.calcPercent();
    else if (key === "=") calc.calcEquals();
    else if (["+", "−", "×", "÷"].includes(key)) calc.calcOperator(key);
    else calc.calcDigit(key);
  }
  return calc.calculator.entry !== "" ? calc.calculator.entry : calc.calcFormat(calc.calculator.value);
}

function fresh() {
  calc.calcClear();
  calc.calculator.history = "Pronta para calcular";
}

test("calculadora soma, subtrai, multiplica e divide", () => {
  fresh();
  assert.equal(press(["1", "2", "+", "8", "="]), "20");
  fresh();
  assert.equal(press(["5", "0", "−", "1", "5", "="]), "35");
  fresh();
  assert.equal(press(["7", "×", "8", "="]), "56");
  fresh();
  assert.equal(press(["9", "9", "÷", "3", "="]), "33");
});

test("calculadora aceita vírgula decimal e mostra a conta", () => {
  fresh();
  assert.equal(press(["2", ",", "5", "×", "4", "="]), "10");
  assert.equal(calc.calculator.history, "2,5 × 4 =");
});

test("calculadora calcula porcentagem nas duas formas usadas no dia a dia", () => {
  fresh();
  assert.equal(press(["2", "0", "0", "+", "1", "0", "%", "="]), "220");
  fresh();
  assert.equal(press(["2", "0", "0", "−", "1", "0", "%", "="]), "180");
  fresh();
  assert.equal(press(["5", "0", "%"]), "0,5");
});

test("calculadora avisa quando a divisão é por zero e o C limpa tudo", () => {
  fresh();
  press(["5", "÷", "0", "="]);
  assert.equal(calc.calculator.error, true);
  calc.calcClear();
  assert.equal(calc.calculator.error, false);
  assert.equal(calc.calculator.value, 0);
  assert.equal(calc.calculator.history, "Pronta para calcular");
});

test("calculadora continua a conta quando o operador é trocado", () => {
  fresh();
  assert.equal(press(["2", "+", "3", "×", "4", "="]), "20");
});
