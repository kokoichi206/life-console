export const isResultType = (checker, originalType, location) => {
  const type = checker.getAwaitedType(originalType);
  if (!type?.isUnion() || type.types.length !== 2) return false;
  const variants = type.types.map((member) => {
    const discriminator = member.getProperty("ok");
    if (!discriminator) return null;
    const value = checker.typeToString(checker.getTypeOfSymbolAtLocation(discriminator, location));
    if (value === "true" && member.getProperty("value")) return "ok";
    if (value === "false" && member.getProperty("error")) return "err";
    return null;
  });
  return variants.includes("ok") && variants.includes("err");
};
