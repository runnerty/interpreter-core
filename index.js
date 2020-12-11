'use strict';

const sizeof = require('object-sizeof');
const interpret = require('./lib/interpreter.js');

// Recursive Object Interpreter:
function interpreter(inputObject, objParams = {}, options, maxSize, globalValues) {
  return new Promise(async resolve => {
    let params;
    if (maxSize && sizeof(inputObject) > maxSize) {
      resolve(inputObject);
    }

    if (objParams && Object.keys(objParams).length !== 0) {
      if (!objParams.objParamsIsReplaced) {
        objParams.objParamsReplaced = await interpreter(objParams, {}, options, maxSize, globalValues);
        objParams.objParamsIsReplaced = true;
        params = objParams.objParamsReplaced;
      } else {
        params = objParams.objParamsReplaced;
      }
    }

    if (globalValues && (!options || !options.ignoreGlobalValues)) {
      params = await addGlobalValuesToObjParams(params, globalValues);
    }

    if (typeof inputObject === 'string') {
      const res = interpretSecure(objParams, inputObject, params, options);
      resolve(res);
    } else {
      if (inputObject instanceof Array) {
        const promArr = [];
        for (let i = 0; i < inputObject.length; i++) {
          promArr.push(interpreter(inputObject[i], objParams, options, maxSize, globalValues));
        }
        Promise.all(promArr).then(values => {
          resolve(values);
        });
      } else {
        if (inputObject instanceof Object) {
          const keys = Object.keys(inputObject);
          const resObject = {};

          for (const key of keys) {
            const _value = await interpreter(inputObject[key], objParams, options, maxSize, globalValues);
            const _key = interpretSecure(objParams, key, params, options);
            resObject[_key] = _value;
          }
          resolve(resObject);
        } else {
          resolve(inputObject);
        }
      }
    }
  });
}

function addGlobalValuesToObjParams(objParams, globalValues) {
  return new Promise(async resolve => {
    const rw_options = {
      ignoreGlobalValues: true
    };
    const gvs = globalValues;
    const res = {};

    for (const gv of gvs) {
      const keymaster = Object.keys(gv)[0];
      const valueObjects = gv[keymaster];
      const keysValueObjects = Object.keys(valueObjects);

      for (const valueKey of keysValueObjects) {
        const intialValue = gv[keymaster][valueKey];

        if (intialValue instanceof Object) {
          if (intialValue.format === 'text') {
            if (intialValue.value instanceof Array) {
              let i = intialValue.value.length;
              let finalValue = '';

              for (const initValue of intialValue.value) {
                i--;
                const rtext = initValue;

                const quotechar = intialValue.quotechar || '';
                const delimiter = intialValue.delimiter || '';

                if (i !== 0) {
                  finalValue = finalValue + quotechar + rtext + quotechar + delimiter;
                } else {
                  finalValue = finalValue + quotechar + rtext + quotechar;
                }
              }

              res[keymaster + '_' + valueKey] = finalValue;
            } else {
              const value = intialValue.value;
              res[keymaster + '_' + valueKey] = value;
            }
          } else {
            if (intialValue.format === 'json') {
              if (intialValue.value instanceof Object || intialValue.value instanceof Array) {
                res[keymaster + '_' + valueKey] = interpretSecure(
                  objParams,
                  JSON.stringify(intialValue.value),
                  objParams,
                  rw_options
                );
              } else {
                res[keymaster + '_' + valueKey] = interpretSecure(
                  objParams,
                  JSON.stringify(intialValue.value),
                  objParams,
                  rw_options
                );
              }
            }
          }
        } else {
          res[keymaster + '_' + valueKey] = intialValue;
        }
      }
    }
    Object.assign(res, objParams);
    resolve(res);
  });
}

function interpretSecure(objParams, inputObject, params, options) {
  try {
    const interpret_res = interpret(inputObject, params, options);
    return interpret_res;
  } catch (err) {
    let msg = '';
    if (objParams.CHAIN_ID) {
      msg = 'CHAIN: ' + objParams.CHAIN_ID;
    } else if ('' + objParams.PROCESS_ID) {
      msg = ' PROCESS: ' + objParams.PROCESS_ID;
    }
    throw new Error(`Interpreter:${msg} : ${err} IN: ${inputObject}`);
  }
}

module.exports = interpreter;
