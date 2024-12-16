import sizeof from 'object-sizeof';
import { interpret } from './lib/interpreter';

// Recursive Object Interpreter:
export default class interpreter {
  static globalValues = {};

  static async interpret(inputObject, objParams, options, globalValues) {
    let params = {};
    if (options?.maxSize && sizeof(inputObject) > options.maxSize) {
      return inputObject;
    }

    if (objParams && Object.keys(objParams).length !== 0) {
      if (!objParams.objParamsIsReplaced) {
        objParams.objParamsReplaced = await interpreter.interpret(objParams, {}, options, globalValues);
        objParams.objParamsIsReplaced = true;
        params = objParams.objParamsReplaced;
      } else {
        params = objParams.objParamsReplaced;
      }
    }

    if (!options?.ignoreGlobalValues) {
      if (globalValues && Object.keys(globalValues).length !== 0) {
        await interpreter._addGlobalValues(interpreter.globalValues, globalValues);
      }
      if (Object.keys(interpreter.globalValues).length !== 0) {
        await interpreter._addGlobalValues(params, interpreter.globalValues);
      }
    }

    if (typeof inputObject === 'string') {
      const res = await interpreter._interpretSecure(objParams, inputObject, params);
      return res;
    } else if (inputObject instanceof Array) {
      const promArr = [];
      for (const item of inputObject) {
        promArr.push(await interpreter.interpret(item, objParams, options, globalValues));
      }
      return await Promise.all(promArr);
    } else if (inputObject instanceof Object) {
      const keys = Object.keys(inputObject);
      const resObject = {};

      for (const key of keys) {
        const _value = await interpreter.interpret(inputObject[key], objParams, options, globalValues);
        const _key = await interpreter._interpretSecure(objParams, key, params);
        resObject[_key] = _value;
      }
      return resObject;
    } else {
      return inputObject;
    }
  }

  static async _addGlobalValues(objParams, globalValues) {
    const res = {};

    const processTextFormat = intialValue => {
      if (Array.isArray(intialValue.value)) {
        const { value, quotechar = '', delimiter = '' } = intialValue;
        return value.map((text, index) => quotechar + text + quotechar).join(delimiter);
      }
      return intialValue.value;
    };

    const processGlobalValue = async (key, intialValue, objParams) => {
      if (intialValue instanceof Object) {
        switch (intialValue.format) {
          case 'text':
            return processTextFormat(intialValue);
          case 'json':
            return await interpreter._interpretSecure(objParams, JSON.stringify(intialValue.value), objParams);
          default:
            return intialValue;
        }
      }
      return intialValue;
    };

    const processValues = async (values, prefix = '') => {
      for (const key of Object.keys(values)) {
        const intialValue = values[key];
        res[prefix + key] = await processGlobalValue(key, intialValue, objParams);
      }
    };

    if (Array.isArray(globalValues)) {
      for (const gv of globalValues) {
        const keymaster = Object.keys(gv)[0];
        await processValues(gv[keymaster], keymaster + '_');
      }
    } else if (globalValues instanceof Object) {
      await processValues(globalValues);
    }

    Object.assign(objParams, res);
  }

  static async _interpretSecure(objParams, inputObject, params) {
    try {
      const interpret_res = await interpret(inputObject, params);
      return interpret_res;
    } catch (err) {
      let msg = '';
      if (objParams?.CHAIN_ID) {
        msg = 'CHAIN: ' + objParams.CHAIN_ID;
      } else if ('' + objParams?.PROCESS_ID) {
        msg = ' PROCESS: ' + objParams?.PROCESS_ID;
      }
      throw new Error(`Interpreter: ${msg}: ${err} IN: ${inputObject}`);
    }
  }
}
