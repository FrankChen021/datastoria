/**
 * Generates a UUID like c357d77e-da75-3516-334b-7111ceecae638
 */
export function uuid2() {
  const charCodes = new Array<number>(32);

  let k = 0;
  for (let i = 0; i < 4; i++) {
    const val = Math.floor(Math.random() * 0x100000000);
    for (let j = 0; j < 8; j++) {
      const base16 = val & 0xf;
      const valShifted = val >>> 4;

      // 48 is the '0' while 97 is the 'a'
      charCodes[k++] = (base16 < 10 ? 48 : 97 - 10) + base16;
    }
  }
  return String.fromCharCode.apply(null, charCodes);
}

