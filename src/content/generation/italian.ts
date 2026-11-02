// «ad» eufonica solo davanti alla stessa vocale (ad Altaluce, a Iriesa), come raccomanda la Crusca
export function towardsCity(name: string): string {
    return /^[aàá]/i.test(name) ? `ad ${name}` : `a ${name}`;
}
