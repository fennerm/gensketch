export const sum = (numbers: number[]): number => {
  return numbers.reduce((partialSum, x) => partialSum + x, 0);
};

export const randomSequence = ({
  alphabet,
  length,
}: {
  alphabet: string;
  length: number;
}): string => {
  let result = " ";
  const charactersLength = alphabet.length;
  for (let i = 0; i < length; i++) {
    result += alphabet.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
};

export const randomGenomicSequence = (length: number): string => {
  return randomSequence({ length, alphabet: "ACGTN" });
};

export const deepCopy = <T,>(source: T): T => {
  return Array.isArray(source)
    ? source.map((item) => deepCopy(item))
    : source instanceof Date
    ? new Date(source.getTime())
    : source && typeof source === "object"
    ? Object.getOwnPropertyNames(source).reduce((o, prop) => {
        Object.defineProperty(o, prop, Object.getOwnPropertyDescriptor(source, prop)!);
        o[prop] = deepCopy((source as { [key: string]: any })[prop]);
        return o;
      }, Object.create(Object.getPrototypeOf(source)))
    : (source as T);
};

export const monkeyPatchBigInt = () => {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    get() {
      "use strict";
      return () => String(this);
    },
  });
};
