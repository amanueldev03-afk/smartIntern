/** Bind every supported migration DDL call to its owning transaction. */
export function migrationQueryInterface(sequelize, transaction) {
  const queryInterface = sequelize.getQueryInterface();
  const optionsPositions = {
    addConstraint: 1,
    addIndex: 2,
    createTable: 2,
    dropTable: 1,
    removeIndex: 2,
  };

  return new Proxy(queryInterface, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== 'function' || !(property in optionsPositions)) return method;

      return (...args) => {
        const position = optionsPositions[property];
        const existingOptions = args[position] || {};
        args[position] = { ...existingOptions, transaction };
        return method.apply(target, args);
      };
    },
  });
}
