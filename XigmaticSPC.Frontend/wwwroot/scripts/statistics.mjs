// Prototype implementation of specification §8.3. Display rounding never changes comparisons.
export const ALGORITHM = 'xigmatic-imr-demo/1.0';
export function numeric(text) {
  const value = String(text).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('Enter a finite number using a decimal point, for example 25.012.');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('The value must be finite.');
  return number;
}
export function baseline(values) {
  if (values.length < 25 || values.some(v => !Number.isFinite(v))) return { valid: false, reason: 'At least 25 valid observations are required.' };
  const mean = values.reduce((a,b) => a+b,0) / values.length;
  const mr = values.slice(1).reduce((sum,v,i) => sum+Math.abs(v-values[i]),0)/(values.length-1);
  if (mr === 0) return { valid: false, reason: 'Zero estimated variation. Select a representative reference set.' };
  const sigma = mr/1.128;
  return { valid:true, mean, mr, sigma, lcl:mean-3*sigma, ucl:mean+3*sigma, mrUcl:3.267*mr, count:values.length, algorithm:ALGORITHM };
}
export function evaluate(value, previous, spec, limits, sameSegment=true) {
  const mr = previous != null && sameSegment ? Math.abs(value-previous) : null;
  const oos = value < spec.lsl || value > spec.usl;
  const evaluated = !!limits?.valid;
  const rules = [];
  if (evaluated && (value < limits.lcl || value > limits.ucl)) rules.push('Individuals beyond control limit');
  if (evaluated && mr != null && mr > limits.mrUcl) rules.push('Moving range beyond upper control limit');
  return { oos, ooc:evaluated ? rules.length>0 : null, mr, rules, algorithm:ALGORITHM };
}
