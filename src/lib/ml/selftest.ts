/**
 * A tiny ONNX model (y = 2x + 1, float32 [n]) encoded in code, so the AI
 * runtime can be checked on each backend without downloading anything.
 * Field numbers follow onnx.proto (ModelProto, GraphProto, NodeProto, ...).
 */

const utf8 = new TextEncoder();

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
const tag = (field: number, wire: 0 | 2) => varint((field << 3) | wire);
const int = (field: number, n: number) => [...tag(field, 0), ...varint(n)];
const msg = (field: number, body: ArrayLike<number>) => [...tag(field, 2), ...varint(body.length), ...Array.from(body)];
const str = (field: number, s: string) => msg(field, utf8.encode(s));

const FLOAT = 1;

function floatScalar(name: string, value: number): number[] {
  const raw = new Uint8Array(new Float32Array([value]).buffer);
  return [...int(2, FLOAT), ...str(8, name), ...msg(9, raw)]; // data_type, name, raw_data
}

function floatVector(name: string): number[] {
  const dim = msg(1, str(2, 'n')); // TensorShapeProto.dim { dim_param: "n" }
  const tensorType = [...int(1, FLOAT), ...msg(2, dim)]; // elem_type, shape
  return [...str(1, name), ...msg(2, msg(1, tensorType))]; // name, type { tensor_type }
}

function node(op: string, inputs: string[], output: string): number[] {
  return [...inputs.flatMap((i) => str(1, i)), ...str(2, output), ...str(3, `${op}_${output}`), ...str(4, op)];
}

export function buildSelfTestModel(): Uint8Array {
  const graph = [
    ...msg(1, node('Mul', ['x', 'two'], 't')),
    ...msg(1, node('Add', ['t', 'one'], 'y')),
    ...str(2, 'lumen_selftest'),
    ...msg(5, floatScalar('two', 2)),
    ...msg(5, floatScalar('one', 1)),
    ...msg(11, floatVector('x')),
    ...msg(12, floatVector('y')),
  ];
  const opset = [...str(1, ''), ...int(2, 17)];
  return new Uint8Array([...int(1, 8), ...str(2, 'lumen-atelier'), ...msg(7, graph), ...msg(8, opset)]);
}

export const SELFTEST_INPUT = [0, 1, 2.5, -4];
export const selfTestExpected = (x: number) => 2 * x + 1;

export function selfTestPasses(output: ArrayLike<number>): boolean {
  return output.length === SELFTEST_INPUT.length && SELFTEST_INPUT.every((x, i) => Math.abs(output[i] - selfTestExpected(x)) < 1e-5);
}
