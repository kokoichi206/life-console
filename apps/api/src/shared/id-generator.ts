export interface IdGenerator {
  create(): string;
}

export const cryptoIdGenerator: IdGenerator = {
  create: () => crypto.randomUUID(),
};
