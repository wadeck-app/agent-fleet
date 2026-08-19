#!/usr/bin/env node
const __importMetaUrl = require('url').pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str2, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str2.match(manualIndent)) return str2;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str2;
        const leadingStr = str2.slice(0, indent);
        const columnText = str2.slice(indent).replace("\r\n", "\n");
        const indentString2 = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString2 : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports2.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str2) {
      return str2.split("-").reduce((str3, word) => {
        return str3 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter2 = require("node:events").EventEmitter;
    var childProcess = require("node:child_process");
    var path10 = require("node:path");
    var fs13 = require("node:fs");
    var process2 = require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter2 {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str2) => process2.stdout.write(str2),
          writeErr: (str2) => process2.stderr.write(str2),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str2, write) => write(str2)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path10.resolve(baseDir, baseName);
          if (fs13.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path10.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs13.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs13.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path10.resolve(
            path10.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path10.basename(
              this._scriptPath,
              path10.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path10.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage2 = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage2(option)} cannot be used with ${getErrorMessage2(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str2, flags, description) {
        if (str2 === void 0) return this._version;
        this._version = str2;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str2}
`);
          this._exit(0, "commander.version", str2);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str2, argsDescription) {
        if (str2 === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str2;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str2) {
        if (str2 === void 0) return this._summary;
        this._summary = str2;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str2) {
        if (str2 === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str2;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str2) {
        if (str2 === void 0) return this._name;
        this._name = str2;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path10.basename(filename, path10.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path11) {
        if (path11 === void 0) return this._executableDir;
        this._executableDir = path11;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports2.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2.program = new Command2();
    exports2.createCommand = (name) => new Command2(name);
    exports2.createOption = (flags, description) => new Option2(flags, description);
    exports2.createArgument = (name, description) => new Argument2(name, description);
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// ../../node_modules/ms/index.js
var require_ms = __commonJS({
  "../../node_modules/ms/index.js"(exports2, module2) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module2.exports = function(val, options) {
      options = options || {};
      var type2 = typeof val;
      if (type2 === "string" && val.length > 0) {
        return parse2(val);
      } else if (type2 === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse2(str2) {
      str2 = String(str2);
      if (str2.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str2
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type2 = (match[2] || "ms").toLowerCase();
      switch (type2) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// ../../node_modules/debug/src/common.js
var require_common = __commonJS({
  "../../node_modules/debug/src/common.js"(exports2, module2) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug2(...args) {
          if (!debug2.enabled) {
            return;
          }
          const self = debug2;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug2.namespace = namespace;
        debug2.useColors = createDebug.useColors();
        debug2.color = createDebug.selectColor(namespace);
        debug2.extend = extend3;
        debug2.destroy = createDebug.destroy;
        Object.defineProperty(debug2, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug2);
        }
        return debug2;
      }
      function extend3(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module2.exports = setup;
  }
});

// ../../node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "../../node_modules/debug/src/browser.js"(exports2, module2) {
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load2;
    exports2.useColors = useColors;
    exports2.storage = localstorage();
    exports2.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports2.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module2.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports2.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports2.storage.setItem("debug", namespaces);
        } else {
          exports2.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load2() {
      let r;
      try {
        r = exports2.storage.getItem("debug") || exports2.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// ../../node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "../../node_modules/has-flag/index.js"(exports2, module2) {
    "use strict";
    module2.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// ../../node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "../../node_modules/supports-color/index.js"(exports2, module2) {
    "use strict";
    var os5 = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var flagForceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      flagForceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      flagForceColor = 1;
    }
    function envForceColor() {
      if ("FORCE_COLOR" in env) {
        if (env.FORCE_COLOR === "true") {
          return 1;
        }
        if (env.FORCE_COLOR === "false") {
          return 0;
        }
        return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
      const noFlagForceColor = envForceColor();
      if (noFlagForceColor !== void 0) {
        flagForceColor = noFlagForceColor;
      }
      const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
      if (forceColor === 0) {
        return 0;
      }
      if (sniffFlags) {
        if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
          return 3;
        }
        if (hasFlag("color=256")) {
          return 2;
        }
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os5.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream, options = {}) {
      const level = supportsColor(stream, {
        streamIsTTY: stream && stream.isTTY,
        ...options
      });
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: getSupportLevel({ isTTY: tty.isatty(1) }),
      stderr: getSupportLevel({ isTTY: tty.isatty(2) })
    };
  }
});

// ../../node_modules/debug/src/node.js
var require_node = __commonJS({
  "../../node_modules/debug/src/node.js"(exports2, module2) {
    var tty = require("tty");
    var util = require("util");
    exports2.init = init;
    exports2.log = log;
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load2;
    exports2.useColors = useColors;
    exports2.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports2.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports2.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports2.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports2.inspectOpts ? Boolean(exports2.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module2.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports2.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports2.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load2() {
      return process.env.DEBUG;
    }
    function init(debug2) {
      debug2.inspectOpts = {};
      const keys = Object.keys(exports2.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug2.inspectOpts[keys[i]] = exports2.inspectOpts[keys[i]];
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str2) => str2.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// ../../node_modules/debug/src/index.js
var require_src = __commonJS({
  "../../node_modules/debug/src/index.js"(exports2, module2) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module2.exports = require_browser();
    } else {
      module2.exports = require_node();
    }
  }
});

// ../../node_modules/@kwsites/file-exists/dist/src/index.js
var require_src2 = __commonJS({
  "../../node_modules/@kwsites/file-exists/dist/src/index.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs_1 = require("fs");
    var debug_1 = __importDefault(require_src());
    var log = debug_1.default("@kwsites/file-exists");
    function check(path10, isFile, isDirectory) {
      log(`checking %s`, path10);
      try {
        const stat = fs_1.statSync(path10);
        if (stat.isFile() && isFile) {
          log(`[OK] path represents a file`);
          return true;
        }
        if (stat.isDirectory() && isDirectory) {
          log(`[OK] path represents a directory`);
          return true;
        }
        log(`[FAIL] path represents something other than a file or directory`);
        return false;
      } catch (e) {
        if (e.code === "ENOENT") {
          log(`[FAIL] path is not accessible: %o`, e);
          return false;
        }
        log(`[FATAL] %o`, e);
        throw e;
      }
    }
    function exists2(path10, type2 = exports2.READABLE) {
      return check(path10, (type2 & exports2.FILE) > 0, (type2 & exports2.FOLDER) > 0);
    }
    exports2.exists = exists2;
    exports2.FILE = 1;
    exports2.FOLDER = 2;
    exports2.READABLE = exports2.FILE + exports2.FOLDER;
  }
});

// ../../node_modules/@kwsites/file-exists/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/@kwsites/file-exists/dist/index.js"(exports2) {
    "use strict";
    function __export2(m) {
      for (var p in m) if (!exports2.hasOwnProperty(p)) exports2[p] = m[p];
    }
    Object.defineProperty(exports2, "__esModule", { value: true });
    __export2(require_src2());
  }
});

// ../../node_modules/@kwsites/promise-deferred/dist/index.js
var require_dist2 = __commonJS({
  "../../node_modules/@kwsites/promise-deferred/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDeferred = exports2.deferred = void 0;
    function deferred2() {
      let done;
      let fail;
      let status = "pending";
      const promise = new Promise((_done, _fail) => {
        done = _done;
        fail = _fail;
      });
      return {
        promise,
        done(result) {
          if (status === "pending") {
            status = "resolved";
            done(result);
          }
        },
        fail(error) {
          if (status === "pending") {
            status = "rejected";
            fail(error);
          }
        },
        get fulfilled() {
          return status !== "pending";
        },
        get status() {
          return status;
        }
      };
    }
    exports2.deferred = deferred2;
    exports2.createDeferred = deferred2;
    exports2.default = deferred2;
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/types.js
var require_types = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DaemonCommandNotFoundError = exports2.DaemonAuthError = exports2.DaemonPortExhaustedError = exports2.DaemonVersionError = exports2.DaemonTakeoverError = exports2.DaemonNotRunningError = void 0;
    var DaemonNotRunningError2 = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonNotRunningError";
      }
    };
    exports2.DaemonNotRunningError = DaemonNotRunningError2;
    var DaemonTakeoverError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonTakeoverError";
      }
    };
    exports2.DaemonTakeoverError = DaemonTakeoverError;
    var DaemonVersionError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonVersionError";
      }
    };
    exports2.DaemonVersionError = DaemonVersionError;
    var DaemonPortExhaustedError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonPortExhaustedError";
      }
    };
    exports2.DaemonPortExhaustedError = DaemonPortExhaustedError;
    var DaemonAuthError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonAuthError";
      }
    };
    exports2.DaemonAuthError = DaemonAuthError;
    var DaemonCommandNotFoundError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "DaemonCommandNotFoundError";
      }
    };
    exports2.DaemonCommandNotFoundError = DaemonCommandNotFoundError;
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/port-file.js
var require_port_file = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/port-file.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.writePortFile = writePortFile;
    exports2.readPortFile = readPortFile;
    exports2.startHeartbeat = startHeartbeat;
    exports2.isFresh = isFresh;
    exports2.deletePortFile = deletePortFile;
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var PORT_FILE = "config.port";
    var FRESHNESS_MS = 6e4;
    var HEARTBEAT_INTERVAL_MS = 3e4;
    async function writePortFile(configDir, port, pid) {
      const data = {
        sdkVersion: 1,
        port,
        pid,
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const filePath = path10.join(configDir, PORT_FILE);
      const tmpPath = filePath + ".tmp";
      await fs13.writeFile(tmpPath, JSON.stringify(data), { encoding: "utf8", mode: 384 });
      await fs13.rename(tmpPath, filePath);
    }
    async function readPortFile(configDir) {
      const filePath = path10.join(configDir, PORT_FILE);
      try {
        const content = await fs13.readFile(filePath, "utf8");
        const data = JSON.parse(content);
        if (typeof data.port !== "number" || typeof data.pid !== "number")
          return null;
        return data;
      } catch {
        return null;
      }
    }
    function startHeartbeat(configDir) {
      const filePath = path10.join(configDir, PORT_FILE);
      const interval = setInterval(async () => {
        const now = /* @__PURE__ */ new Date();
        try {
          await fs13.utimes(filePath, now, now);
        } catch {
        }
      }, HEARTBEAT_INTERVAL_MS);
      interval.unref?.();
      return () => clearInterval(interval);
    }
    async function isFresh(configDir) {
      const filePath = path10.join(configDir, PORT_FILE);
      try {
        const stat = await fs13.stat(filePath);
        return Date.now() - stat.mtimeMs < FRESHNESS_MS;
      } catch {
        return false;
      }
    }
    async function deletePortFile(configDir) {
      const filePath = path10.join(configDir, PORT_FILE);
      try {
        await fs13.unlink(filePath);
      } catch {
      }
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/process-utils.js
var require_process_utils = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/process-utils.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isProcessAlive = isProcessAlive;
    function isProcessAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (err) {
        const e = err;
        if (e.code === "ESRCH")
          return false;
        if (e.code === "EPERM")
          return true;
        return false;
      }
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/takeover.js
var require_takeover = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/takeover.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.takeoverIfRunning = takeoverIfRunning;
    var http3 = __importStar(require("http"));
    var net = __importStar(require("net"));
    var port_file_js_1 = require_port_file();
    var types_js_1 = require_types();
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var process_utils_js_1 = require_process_utils();
    async function pollUntilDead(pid, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!(0, process_utils_js_1.isProcessAlive)(pid))
          return true;
        await new Promise((resolve4) => setTimeout(resolve4, 100));
      }
      return !(0, process_utils_js_1.isProcessAlive)(pid);
    }
    function isPortOpen(port) {
      return new Promise((resolve4) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once("connect", () => {
          socket.destroy();
          resolve4(true);
        });
        socket.once("error", () => resolve4(false));
        socket.once("timeout", () => {
          socket.destroy();
          resolve4(false);
        });
        socket.connect(port, "127.0.0.1");
      });
    }
    async function pollUntilPortClosed(port, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!await isPortOpen(port))
          return true;
        await new Promise((resolve4) => setTimeout(resolve4, 100));
      }
      return !await isPortOpen(port);
    }
    function postQuit(port, token) {
      return new Promise((resolve4, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), 3e3);
        const req = http3.request({
          hostname: "127.0.0.1",
          port,
          method: "POST",
          path: "/quit",
          headers: { Authorization: `Bearer ${token}`, "Content-Length": "0" }
        }, (res) => {
          clearTimeout(timeout);
          res.resume();
          resolve4();
        });
        req.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        req.end();
      });
    }
    async function takeoverIfRunning(configDir, hooks) {
      const data = await (0, port_file_js_1.readPortFile)(configDir);
      if (!data)
        return;
      const { pid, port } = data;
      if (pid !== process.pid && !(0, process_utils_js_1.isProcessAlive)(pid)) {
        await (0, port_file_js_1.deletePortFile)(configDir);
        return;
      }
      if (!await (0, port_file_js_1.isFresh)(configDir)) {
        await (0, port_file_js_1.deletePortFile)(configDir);
        return;
      }
      let token;
      try {
        token = (await fs13.readFile(path10.join(configDir, "health_token"), "utf8")).trim();
      } catch {
        token = "";
      }
      try {
        await postQuit(port, token);
      } catch {
      }
      const portClosed = await pollUntilPortClosed(port, 3e3);
      if (portClosed) {
        await (0, port_file_js_1.deletePortFile)(configDir);
        hooks.onTakeover?.(pid);
        return;
      }
      if (pid !== process.pid) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
        }
        const deadAfterSigterm = await pollUntilDead(pid, 3e3);
        if (deadAfterSigterm) {
          await (0, port_file_js_1.deletePortFile)(configDir);
          hooks.onTakeover?.(pid);
          return;
        }
      }
      hooks.onTakeoverFailed?.(pid);
      throw new types_js_1.DaemonTakeoverError(`Failed to evict daemon with PID ${pid}`);
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/constants.js
var require_constants = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SDK_VERSION = void 0;
    exports2.SDK_VERSION = 1;
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/health-server.js
var require_health_server = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/health-server.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.startHealthServer = startHealthServer;
    var http3 = __importStar(require("http"));
    var crypto4 = __importStar(require("crypto"));
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var types_js_1 = require_types();
    var constants_js_1 = require_constants();
    var PACKAGE_VERSION = "1.0.0";
    async function tryListen(server, port) {
      return new Promise((resolve4, reject) => {
        const onError2 = (err) => {
          server.removeListener("error", onError2);
          reject(err);
        };
        server.once("error", onError2);
        server.listen(port, "127.0.0.1", () => {
          server.removeListener("error", onError2);
          const addr = server.address();
          resolve4(addr.port);
        });
      });
    }
    function readBody(req) {
      return new Promise((resolve4, reject) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => resolve4(body));
        req.on("error", reject);
      });
    }
    function sendJson(res, status, data) {
      const json2 = JSON.stringify(data);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(json2);
    }
    function checkToken(provided, stored) {
      if (!provided || !stored)
        return false;
      if (provided.length !== stored.length)
        return false;
      try {
        return crypto4.timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(stored, "utf8"));
      } catch {
        return false;
      }
    }
    function requireAuth(req, res, token) {
      const authHeader = req.headers["authorization"] ?? "";
      const provided = authHeader.replace(/^Bearer\s+/, "");
      if (!checkToken(provided, token)) {
        sendJson(res, 401, { error: "Unauthorized" });
        return false;
      }
      return true;
    }
    async function startHealthServer(options) {
      const { configDir, commands, health, versionExtra, appVersion, hooks, onQuit } = options;
      const basePort = options.port ?? 47823;
      const token = crypto4.randomBytes(16).toString("hex");
      const tokenPath = path10.join(configDir, "health_token");
      await fs13.writeFile(tokenPath, token, { mode: 384 });
      const server = http3.createServer(async (req, res) => {
        const rawUrl = req.url ?? "/";
        const url = new URL(rawUrl, "http://localhost").pathname;
        const method = req.method ?? "GET";
        if (method === "POST" && url === "/quit") {
          if (!requireAuth(req, res, token))
            return;
          sendJson(res, 200, { ok: true });
          if (onQuit) {
            setImmediate(() => {
              void Promise.resolve(onQuit());
            });
          }
          return;
        }
        if (method === "GET" && url === "/version") {
          sendJson(res, 200, {
            ...versionExtra ? versionExtra() : {},
            version: appVersion ?? PACKAGE_VERSION,
            pid: process.pid,
            config_dir: configDir,
            sdkVersion: constants_js_1.SDK_VERSION,
            port: server.address()?.port ?? actualPort
          });
          return;
        }
        if (method === "GET" && url === "/health") {
          if (!health) {
            sendJson(res, 404, { error: "No health handler configured" });
            return;
          }
          if (!requireAuth(req, res, token))
            return;
          try {
            sendJson(res, 200, health());
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            hooks?.onCommandError?.("health", error);
            if (!res.headersSent) {
              sendJson(res, 500, { error: `Health check failed: ${error.message}` });
            }
          }
          return;
        }
        if (method === "POST") {
          const commandName = url.slice(1);
          if (!requireAuth(req, res, token))
            return;
          const handler = Object.hasOwn(commands, commandName) ? commands[commandName] : void 0;
          if (!handler) {
            sendJson(res, 404, { error: `Unknown command: ${commandName}` });
            return;
          }
          let payload = void 0;
          const body = await readBody(req);
          if (body) {
            try {
              payload = JSON.parse(body);
            } catch {
              sendJson(res, 400, { error: "Invalid JSON body" });
              return;
            }
          }
          const start = Date.now();
          try {
            const result = await Promise.resolve(handler(payload));
            const durationMs = Date.now() - start;
            hooks?.onCommand?.(commandName, durationMs);
            if (result === void 0) {
              sendJson(res, 200, { ok: true });
            } else {
              sendJson(res, 200, { ok: true, result });
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            hooks?.onCommandError?.(commandName, error);
            if (!res.headersSent) {
              sendJson(res, 500, { error: `Command failed: ${error.message}` });
            }
          }
          return;
        }
        res.writeHead(404);
        res.end();
      });
      let actualPort = null;
      if (basePort === 0) {
        actualPort = await tryListen(server, 0);
      } else {
        const maxAttempts = 11;
        for (let i = 0; i < maxAttempts; i++) {
          const tryPort = basePort + i;
          try {
            actualPort = await tryListen(server, tryPort);
            break;
          } catch (err) {
            const e = err;
            if (e.code !== "EADDRINUSE")
              throw err;
            if (i < maxAttempts - 1)
              continue;
            throw new types_js_1.DaemonPortExhaustedError(`Could not bind to any port in range ${basePort}-${basePort + maxAttempts - 1}`);
          }
        }
      }
      return {
        port: actualPort,
        close() {
          return new Promise((resolve4, reject) => {
            if (typeof server.closeAllConnections === "function") {
              server.closeAllConnections();
            }
            server.close((err) => {
              if (err)
                reject(err);
              else
                resolve4();
            });
          });
        }
      };
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/idle-timer.js
var require_idle_timer = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/idle-timer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createIdleTimer = createIdleTimer;
    function createIdleTimer(idleTimeoutMs, drainTimeoutMs, onIdle) {
      if (idleTimeoutMs === null) {
        return {
          reset: () => {
          },
          commandStarted: () => {
          },
          commandFinished: () => {
          },
          dispose: () => {
          }
        };
      }
      let inFlight = 0;
      let idleTimer = null;
      let drainTimer = null;
      let disposed = false;
      function clearTimers() {
        if (idleTimer !== null) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        if (drainTimer !== null) {
          clearTimeout(drainTimer);
          drainTimer = null;
        }
      }
      function scheduleIdle() {
        clearTimers();
        if (disposed)
          return;
        idleTimer = setTimeout(() => {
          idleTimer = null;
          if (inFlight > 0) {
            drainTimer = setTimeout(() => {
              drainTimer = null;
              if (!disposed)
                onIdle();
            }, drainTimeoutMs);
          } else {
            if (!disposed)
              onIdle();
          }
        }, idleTimeoutMs);
      }
      scheduleIdle();
      return {
        reset() {
          if (!disposed)
            scheduleIdle();
        },
        commandStarted() {
          inFlight++;
        },
        commandFinished() {
          if (inFlight > 0)
            inFlight--;
          if (inFlight === 0 && drainTimer !== null) {
            clearTimeout(drainTimer);
            drainTimer = null;
            if (!disposed) {
              Promise.resolve().then(() => {
                if (!disposed)
                  onIdle();
              });
            }
          }
        },
        dispose() {
          disposed = true;
          clearTimers();
        }
      };
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/startup-lock.js
var require_startup_lock = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/startup-lock.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.acquireStartupLock = acquireStartupLock;
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var types_js_1 = require_types();
    var process_utils_js_1 = require_process_utils();
    var LOCK_RETRY_INTERVAL_MS = 100;
    var LOCK_TIMEOUT_MS = 1e4;
    async function acquireStartupLock(configDir, timeoutMs) {
      const lockPath = path10.join(configDir, "config.lock");
      const effectiveTimeout = timeoutMs ?? LOCK_TIMEOUT_MS;
      const deadline = Date.now() + effectiveTimeout;
      while (true) {
        try {
          const fd = await fs13.open(lockPath, "wx");
          const data = { pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await fd.writeFile(JSON.stringify(data), "utf8");
          await fd.close();
          return async () => {
            try {
              await fs13.unlink(lockPath);
            } catch {
            }
          };
        } catch (err) {
          const e = err;
          if (e.code !== "EEXIST")
            throw err;
          try {
            const content = await fs13.readFile(lockPath, "utf8");
            const { pid } = JSON.parse(content);
            if (!(0, process_utils_js_1.isProcessAlive)(pid)) {
              let unlinkBlocked = false;
              await fs13.unlink(lockPath).catch((unlinkErr) => {
                const code = unlinkErr.code;
                if (code !== "ENOENT") {
                  if (Date.now() >= deadline) {
                    throw new types_js_1.DaemonTakeoverError(`Could not acquire startup lock in ${configDir} within ${effectiveTimeout}ms`);
                  }
                  unlinkBlocked = true;
                }
              });
              if (unlinkBlocked) {
                await new Promise((resolve4) => setTimeout(resolve4, LOCK_RETRY_INTERVAL_MS));
              }
              continue;
            }
          } catch (innerErr) {
            if (innerErr instanceof types_js_1.DaemonTakeoverError)
              throw innerErr;
            if (Date.now() >= deadline) {
              throw new types_js_1.DaemonTakeoverError(`Could not acquire startup lock in ${configDir} within ${effectiveTimeout}ms`);
            }
            continue;
          }
          if (Date.now() >= deadline) {
            throw new types_js_1.DaemonTakeoverError(`Could not acquire startup lock in ${configDir} within ${effectiveTimeout}ms`);
          }
          await new Promise((resolve4) => setTimeout(resolve4, LOCK_RETRY_INTERVAL_MS));
        }
      }
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/daemon.js
var require_daemon = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/daemon.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDaemon = createDaemon2;
    var takeover_js_1 = require_takeover();
    var port_file_js_1 = require_port_file();
    var health_server_js_1 = require_health_server();
    var idle_timer_js_1 = require_idle_timer();
    var startup_lock_js_1 = require_startup_lock();
    async function createDaemon2(options) {
      const { configDir, commands, port, idleTimeout = null, drainTimeout = 3e4, health, appVersion, versionExtra, hooks = {} } = options;
      const releaseLock = await (0, startup_lock_js_1.acquireStartupLock)(configDir);
      let serverHandle = null;
      let actualPort;
      try {
        await (0, takeover_js_1.takeoverIfRunning)(configDir, hooks);
        serverHandle = await (0, health_server_js_1.startHealthServer)({
          configDir,
          commands,
          port,
          health,
          appVersion,
          versionExtra,
          hooks,
          // X4 — handle is captured by reference here before it is assigned below (line ~79).
          // This is safe because onQuit is only ever called via setImmediate() in
          // health-server.ts, which defers execution past the current tick — by which
          // point handle has been assigned. Do NOT remove the setImmediate in
          // health-server.ts without also fixing this forward reference.
          onQuit: () => handle.stop("command")
        });
        actualPort = serverHandle.port;
        await (0, port_file_js_1.writePortFile)(configDir, actualPort, process.pid);
      } catch (err) {
        if (serverHandle !== null)
          await serverHandle.close().catch(() => {
          });
        throw err;
      } finally {
        await releaseLock();
      }
      const stopHeartbeat = (0, port_file_js_1.startHeartbeat)(configDir);
      const idleTimer = (0, idle_timer_js_1.createIdleTimer)(idleTimeout ?? null, drainTimeout, () => {
        void handle.stop("idle");
      });
      let stopped = false;
      const onSignal = () => {
        void handle.stop("signal");
      };
      process.once("SIGTERM", onSignal);
      process.once("SIGINT", onSignal);
      const handle = {
        get port() {
          return actualPort;
        },
        async stop(reason = "command") {
          if (stopped)
            return;
          stopped = true;
          process.removeListener("SIGTERM", onSignal);
          process.removeListener("SIGINT", onSignal);
          idleTimer.dispose();
          stopHeartbeat();
          await (0, port_file_js_1.deletePortFile)(configDir);
          await serverHandle.close();
          hooks.onShutdown?.(reason);
        }
      };
      hooks.onStart?.(actualPort);
      return handle;
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/client.js
var require_client = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/client.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDaemonClient = createDaemonClient2;
    var http3 = __importStar(require("http"));
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var port_file_js_1 = require_port_file();
    var types_js_1 = require_types();
    var process_utils_js_1 = require_process_utils();
    var constants_js_1 = require_constants();
    function httpPost(port, commandPath, token, payload) {
      return new Promise((resolve4, reject) => {
        const body = payload !== void 0 ? JSON.stringify(payload) : "";
        const req = http3.request({
          hostname: "127.0.0.1",
          port,
          method: "POST",
          path: `/${commandPath}`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        }, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve4({ status: res.statusCode ?? 0, body: parsed });
            } catch {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          });
        });
        req.setTimeout(5e3, () => {
          req.destroy(new Error("HTTP timeout after 5s"));
        });
        req.on("error", reject);
        if (body)
          req.write(body);
        req.end();
      });
    }
    function httpGet(port, urlPath) {
      return new Promise((resolve4, reject) => {
        const req = http3.request({ hostname: "127.0.0.1", port, method: "GET", path: urlPath }, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              resolve4({ status: res.statusCode ?? 0, body: JSON.parse(data) });
            } catch {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          });
        });
        req.setTimeout(5e3, () => {
          req.destroy(new Error("HTTP timeout after 5s"));
        });
        req.on("error", reject);
        req.end();
      });
    }
    function createDaemonClient2(options) {
      const { configDir } = options;
      return {
        async isRunning() {
          try {
            const data = await (0, port_file_js_1.readPortFile)(configDir);
            if (!data)
              return false;
            return (0, process_utils_js_1.isProcessAlive)(data.pid);
          } catch {
            return false;
          }
        },
        async version() {
          const data = await (0, port_file_js_1.readPortFile)(configDir);
          if (!data)
            throw new types_js_1.DaemonNotRunningError(`Daemon is not running (no port file found in ${configDir})`);
          if (!(0, process_utils_js_1.isProcessAlive)(data.pid)) {
            throw new types_js_1.DaemonNotRunningError(`Daemon is not running (process ${data.pid} is not alive)`);
          }
          const resp = await httpGet(data.port, "/version");
          return resp.body;
        },
        async send(command, payload) {
          const data = await (0, port_file_js_1.readPortFile)(configDir);
          const localHandler = options.commands[command];
          if (!data || !(0, process_utils_js_1.isProcessAlive)(data.pid)) {
            if (localHandler) {
              return localHandler(payload);
            }
            const reason = !data ? `no port file found in ${configDir}` : `Daemon process ${data.pid} is not running`;
            throw new types_js_1.DaemonNotRunningError(`Daemon is not running (${reason})`);
          }
          const daemonMajor = data.sdkVersion ?? 0;
          const clientMajor = constants_js_1.SDK_VERSION;
          if (daemonMajor < clientMajor) {
            throw new types_js_1.DaemonVersionError(`Daemon SDK version ${daemonMajor} is older than client SDK version ${clientMajor}`);
          } else if (daemonMajor > clientMajor) {
            console.warn(`Warning: Daemon SDK version ${daemonMajor} is newer than client SDK version ${clientMajor}`);
          }
          let token;
          try {
            token = (await fs13.readFile(path10.join(configDir, "health_token"), "utf8")).trim();
          } catch (err) {
            const code = err.code;
            if (code === "ENOENT") {
              throw new types_js_1.DaemonNotRunningError(`Daemon is not running (health_token not found in ${configDir})`);
            }
            throw err;
          }
          const resp = await httpPost(data.port, command, token, payload).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("timeout")) {
              throw new types_js_1.DaemonNotRunningError(`Daemon is not running (connection failed: ${msg})`);
            }
            throw err;
          });
          if (resp.status === 401)
            throw new types_js_1.DaemonAuthError("Unauthorized - token mismatch");
          if (resp.status === 404)
            throw new types_js_1.DaemonCommandNotFoundError(`Unknown command: ${command}`);
          if (resp.status === 500)
            throw new Error(resp.body.error ?? "Command failed");
          return resp.body.result;
        }
      };
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/test-harness.js
var require_test_harness = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/test-harness.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createTestDaemon = createTestDaemon;
    var os5 = __importStar(require("os"));
    var crypto4 = __importStar(require("crypto"));
    var fs13 = __importStar(require("fs/promises"));
    var path10 = __importStar(require("path"));
    var daemon_js_1 = require_daemon();
    var client_js_1 = require_client();
    async function createTestDaemon(options) {
      const tmpDir = path10.join(os5.tmpdir(), crypto4.randomUUID());
      await fs13.mkdir(tmpDir, { recursive: true });
      const port = options.port ?? 0;
      const daemon = await (0, daemon_js_1.createDaemon)({
        ...options,
        configDir: tmpDir,
        port
      });
      const client = (0, client_js_1.createDaemonClient)({ configDir: tmpDir, commands: options.commands });
      const handle = {
        client,
        configDir: tmpDir,
        get port() {
          return daemon.port;
        },
        async stop(reason) {
          return daemon.stop(reason);
        },
        async [Symbol.asyncDispose]() {
          await daemon.stop("command");
          await fs13.rm(tmpDir, { recursive: true, force: true });
        }
      };
      return handle;
    }
  }
});

// ../../node_modules/@wadeck/singleton-daemon-kit/dist/index.js
var require_dist3 = __commonJS({
  "../../node_modules/@wadeck/singleton-daemon-kit/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_types(), exports2);
    __exportStar(require_port_file(), exports2);
    __exportStar(require_takeover(), exports2);
    __exportStar(require_health_server(), exports2);
    __exportStar(require_idle_timer(), exports2);
    __exportStar(require_daemon(), exports2);
    __exportStar(require_client(), exports2);
    __exportStar(require_test_harness(), exports2);
  }
});

// ../../node_modules/ws/lib/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants2();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// ../../node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants2();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants2();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants2();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// ../../node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP: NOOP2 } = require_constants2();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP2;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge2 = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge2 = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge2 ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge2) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError2, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError2(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants2();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type2) {
        this[kTarget] = null;
        this[kType] = type2;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type2, options = {}) {
        super(type2);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type2, options = {}) {
        super(type2);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type2, options = {}) {
        super(type2);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type2, handler, options = {}) {
        for (const listener of this.listeners(type2)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type2 === "message") {
          wrapper = function onMessage(data, isBinary2) {
            const event = new MessageEvent("message", {
              data: isBinary2 ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type2 === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type2 === "error") {
          wrapper = function onError2(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type2 === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type2, wrapper);
        } else {
          this.on(type2, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type2, handler) {
        for (const listener of this.listeners(type2)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type2, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse2(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse: parse2 };
  }
});

// ../../node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter2 = require("events");
    var https2 = require("https");
    var http3 = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP: NOOP2
    } = require_constants2();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse: parse2 } = require_extension();
    var { toBuffer } = require_buffer_util();
    var closeTimeout = 30 * 1e3;
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter2 {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type2) {
        if (!BINARY_TYPES.includes(type2)) return;
        this._binaryType = type2;
        if (this._receiver) this._receiver._binaryType = type2;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https2.request : http3.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse2(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary2) {
      this[kWebSocket].emit("message", data, isBinary2);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP2);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      let chunk;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && (chunk = websocket._socket.read()) !== null) {
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP2);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary2) {
        const data = !isBinary2 && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// ../../node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse2(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse: parse2 };
  }
});

// ../../node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter2 = require("events");
    var http3 = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { GUID, kWebSocket } = require_constants2();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer3 = class extends EventEmitter2 {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http3.createServer((req, res) => {
            const body = http3.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer3;
    function addListeners(server, map2) {
      for (const event of Object.keys(map2)) server.on(event, map2[event]);
      return function removeListeners() {
        for (const event of Object.keys(map2)) {
          server.removeListener(event, map2[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http3.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http3.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// dist/cli/FlowIndex.js
var import_module = require("module");
var import_node_url3 = require("node:url");

// ../flow-engine/src/docs/FlowCapabilitiesGenerator.ts
var FlowCapabilitiesGenerator = class {
  /**
   * Generate a structured Markdown document describing all flow engine capabilities.
   *
   * @returns Markdown string ready for injection into an AI prompt
   */
  generate() {
    return [
      this.generateHeader(),
      this.generateStepTypes(),
      this.generateVariableTypes(),
      this.generateTemplateSyntax(),
      this.generateWorkspaceModes(),
      this.generateStatusTransitions(),
      this.generateInterventionTypes(),
      this.generateFeedbackAndRetrospectiveAPIs()
    ].join("\n\n");
  }
  generateHeader() {
    return `# Flow Engine Capabilities

This document describes all capabilities supported by the flow engine.
Use it to design valid flows when responding to user requests.`;
  }
  generateStepTypes() {
    const TMPL = "${{";
    return `## Section 1: Step Types

Each step has a \`type\` discriminator and inherits base fields from \`BaseFlowStep\`:
- \`id\` (string, required) \u2014 unique identifier within the flow
- \`name\` (string, required) \u2014 human-readable label
- \`context\` \u2014 optional: \`files\` (glob patterns), \`previousOutputs\` (step IDs), \`taskMetadata\` (keys)
- \`output\` \u2014 map of variable names to extraction configs (pattern, from, transform, default)
- \`depends\` \u2014 list of step IDs that must complete before this step runs
- \`when\` \u2014 conditional expression (evaluated to boolean); step is skipped if false
- \`skipOnLoop\` \u2014 skip this step when a feedback loop is triggered (useful for one-time setup)
- \`retry\` \u2014 \`{ maxAttempts, backoff: 'linear' | 'exponential' }\`
- \`onFailure\` \u2014 feedback loop config: \`{ goto, maxIterations, resetOnSuccess, addComment }\`
- \`contract\` \u2014 \`{ preProcess: { validateInputs, required }, postProcess: { validateOutputs, required } }\`

### model

Executes an AI model with a prompt. Supports template variable interpolation in the prompt.

\`\`\`yaml
type: model
model: sonnet | haiku | opus
prompt: |
  Analyze the following: ${TMPL} inputs.description }}
  Previous result: ${TMPL} steps.previous.outputs.result }}
\`\`\`

Key fields:
- \`model\` (ModelType, required) \u2014 which AI model to use: \`sonnet\`, \`haiku\`, or \`opus\`
- \`prompt\` (string, required) \u2014 prompt template with \`${TMPL} }}\` variable interpolation

### script

Executes a shell command or script in the workspace.

\`\`\`yaml
type: script
script: |
  npm test
  echo "Tests done"
workingDir: ./packages/my-package
env:
  NODE_ENV: test
captureOutput: true
\`\`\`

Key fields:
- \`script\` (string, required) \u2014 shell command(s) to execute
- \`workingDir\` (string, optional) \u2014 working directory for execution
- \`env\` (Record<string, string>, optional) \u2014 environment variables
- \`captureOutput\` (boolean, optional) \u2014 whether to capture stdout/stderr

### subflow

References and executes another flow (composition). Enables reuse and modularity.

\`\`\`yaml
type: subflow
flowId: my-other-flow
inputs:
  description: ${TMPL} inputs.description }}
  context: ${TMPL} steps.gather.outputs.context }}
workspaceStrategy: inherit | separate
allowRecursion: false
\`\`\`

Key fields:
- \`flowId\` (string, required) \u2014 ID of the flow to execute
- \`inputs\` (Record<string, string>, required) \u2014 template inputs passed to the subflow
- \`workspaceStrategy\` (\`'inherit' | 'separate'\`, optional, default: \`inherit\`) \u2014 whether to share workspace
- \`output\` \u2014 map of variable names to template strings extracting from subflow outputs
- \`allowRecursion\` (boolean, optional) \u2014 must be explicitly \`true\` to allow a flow calling itself

### user_intervention

Pauses flow execution and waits for user interaction. Can be non-blocking with a timeout.

\`\`\`yaml
type: user_intervention
interventionType: approval | question | choice
blocking: true
timeout:
  minutes: 60
  onTimeout: fail | continue | default
  defaultValue: ~
\`\`\`

Key fields:
- \`interventionType\` (required) \u2014 \`approval\`, \`question\`, or \`choice\`
- \`blocking\` (boolean, default: \`true\`) \u2014 whether to pause flow until user responds
- \`timeout\` \u2014 optional: \`{ minutes, onTimeout: 'fail' | 'continue' | 'default', defaultValue }\`
- \`approval\` \u2014 config for approval type: \`{ title, description, allowReject }\`
- \`question\` \u2014 config for question type: \`{ question, responseType: 'text' | 'number' | 'boolean', validation }\`
- \`choice\` \u2014 config for choice type: \`{ question, options: [{ id, label, description }], allowMultiple }\``;
  }
  generateVariableTypes() {
    return `## Section 2: Variable Types

All 20 supported \`VariableType\` values:

### Base types (legacy, always supported)
| Type | Description |
|------|-------------|
| \`string\` | Single-line text value |
| \`number\` | Floating-point number |
| \`boolean\` | True/false value |
| \`object\` | Arbitrary JSON object |

### Text types
| Type | Description |
|------|-------------|
| \`text\` | Multi-line text (textarea) |
| \`url\` | URL with protocol validation |
| \`markdown\` | Markdown-formatted text, rendered in UI |

### Number types
| Type | Description |
|------|-------------|
| \`integer\` | Whole number only |
| \`percentage\` | Number between 0 and 100 |
| \`duration\` | Time duration with unit (seconds/minutes/hours/days) |

### Selection types
| Type | Description |
|------|-------------|
| \`enum\` | Single selection from a predefined list |
| \`multi-enum\` | Multiple selections from a predefined list |

### File types
| Type | Description |
|------|-------------|
| \`file\` | File path, optionally filtered by extension |
| \`folder\` | Directory path |

### Date types
| Type | Description |
|------|-------------|
| \`date\` | Date value (YYYY-MM-DD) |
| \`datetime\` | Date and time value (ISO 8601) |

### Code types
| Type | Description |
|------|-------------|
| \`regex\` | Regular expression pattern |

### Structure types
| Type | Description |
|------|-------------|
| \`array\` | Ordered list of values (configurable item type) |
| \`keyvalue\` | Key-value pairs (map/dictionary) |

### Security types
| Type | Description |
|------|-------------|
| \`password\` | Sensitive value, masked in UI |

### Business types
| Type | Description |
|------|-------------|
| \`priority\` | Priority level: \`low\`, \`medium\`, \`high\`, or \`critical\` |`;
  }
  generateTemplateSyntax() {
    const TMPL = "${{";
    return `## Section 3: Template Syntax

Templates use GitHub Actions-style syntax: \`${TMPL} expression }}\`.

### Accessing step outputs
\`\`\`
${TMPL} steps.<stepId>.outputs.<variableName> }}
\`\`\`
Example: \`${TMPL} steps.analyze.outputs.recommendation }}\`

### Accessing step execution metadata
Every step populates a \`meta\` scope with execution metadata (strongly typed per step type).
\`\`\`
${TMPL} steps.<stepId>.meta.<field> }}
\`\`\`

**Script step meta fields:** \`exit_code\`, \`duration_ms\`

**Model step meta fields:** \`session_id\`, \`session_file\`, \`model\`, \`ttft_ms\`, \`duration_ms\`, \`cost.input_tokens\`, \`cost.output_tokens\`, \`cost.usd\`

Examples:
- \`${TMPL} steps.generate.meta.session_id }}\` \u2014 Claude session ID (for session continuation)
- \`${TMPL} steps.generate.meta.cost.usd }}\` \u2014 cost in USD
- \`${TMPL} steps.run-tests.meta.exit_code }}\` \u2014 script exit code

### Accessing flow inputs
\`\`\`
${TMPL} inputs.<variableName> }}
\`\`\`
Example: \`${TMPL} inputs.description }}\`

### Accessing task metadata
\`\`\`
${TMPL} task.<property> }}
${TMPL} task.metadata.<key> }}
\`\`\`
Examples:
- \`${TMPL} task.priority }}\`
- \`${TMPL} task.metadata.ticketId }}\`

### Built-in transform functions (for output extraction)
Applied via the \`transform\` field in \`OutputVariableConfig\`:
- \`parseJSON\` \u2014 parse JSON string to object
- \`parseYAML\` \u2014 parse YAML string to object
- \`parseInt\` \u2014 parse integer
- \`parseFloat\` \u2014 parse float
- \`parseBoolean\` \u2014 parse boolean
- \`trim\` \u2014 strip whitespace
- \`toLowerCase\` / \`toUpperCase\` \u2014 case conversion
- \`split\` \u2014 split string to array

### Output extraction from user intervention responses
Use the \`from\` field to reference intervention response fields:
- \`from: intervention.approved\` \u2014 whether the user approved
- \`from: intervention.comment\` \u2014 optional comment from user
- \`from: intervention.answeredBy\` \u2014 user who responded
- \`from: intervention.value\` \u2014 the answer value (for question/choice types)`;
  }
  generateWorkspaceModes() {
    return `## Section 4: Workspace Modes

Configured via the \`workspace\` field of a \`FlowDefinition\`:

\`\`\`yaml
workspace:
  mode: isolated | shared | manual
  gitStrategy: main-only | feature-branch | any | worktree
  reusePolicy: never | if-available | always
  concurrencyKey: optional-group-key
\`\`\`

### Modes
| Mode | Description |
|------|-------------|
| \`isolated\` | Each execution gets a fresh workspace; changes are isolated per run |
| \`shared\` | All steps and executions share the same workspace |
| \`manual\` | User specifies the workspace path explicitly |

### Git strategies
| Strategy | Description |
|----------|-------------|
| \`main-only\` | Only the main/master branch is used |
| \`feature-branch\` | A feature branch is created for each execution |
| \`any\` | No constraint on branch |
| \`worktree\` | Uses git worktrees for isolation without full clones |

### Reuse policies
| Policy | Description |
|--------|-------------|
| \`never\` | Always provision a fresh workspace |
| \`if-available\` | Reuse an existing compatible workspace if one is free |
| \`always\` | Always reuse; fail if none available |`;
  }
  generateStatusTransitions() {
    return `## Section 5: Status Transitions

Configured via the optional \`statusTransitions\` field of a \`FlowDefinition\`.
Defaults: \`onSuccess \u2192 review\`, \`onFailure \u2192 changes_requested\`.

\`\`\`yaml
statusTransitions:
  onSuccess:
    task: review           # TaskStatus to apply on success
    ticket: in_progress    # TicketStatus to apply on the linked ticket
  onFailure:
    task: changes_requested
    ticket: todo
\`\`\`

Shorthand (task status only):
\`\`\`yaml
statusTransitions:
  onSuccess: review
  onFailure: changes_requested
\`\`\`

### TaskStatus values
\`backlog\`, \`refining\`, \`refined\`, \`prioritizing\`, \`todo\`, \`in_progress\`,
\`testing\`, \`review\`, \`reviewing\`, \`changes_requested\`, \`approved\`, \`merged\`,
\`blocked\`, \`cancelled\`, \`awaiting_user\`

### TicketStatus
Ticket statuses are project-configurable strings. Built-in defaults:
\`backlog\`, \`todo\`, \`in_progress\`, \`done\`, \`cancelled\`, \`pending_integration\`, \`integrated\``;
  }
  generateInterventionTypes() {
    return `## Section 6: Intervention Types

Used in \`user_intervention\` steps. Three types are supported:

### approval
A yes/no decision from the user.
\`\`\`yaml
type: user_intervention
interventionType: approval
approval:
  title: "Approve the proposed changes?"
  description: "Review the diff above before approving."
  allowReject: true
\`\`\`
Output fields: \`intervention.approved\` (boolean), \`intervention.comment\` (string)

### question
A free-form text answer from the user.
\`\`\`yaml
type: user_intervention
interventionType: question
question:
  question: "What is the target branch for this PR?"
  responseType: text   # text | number | boolean
  validation:
    - type: required
    - type: pattern
      value: "^[a-z0-9/-]+$"
\`\`\`
Output fields: \`intervention.value\`, \`intervention.answeredBy\`

### choice
User picks from a list of predefined options.
\`\`\`yaml
type: user_intervention
interventionType: choice
choice:
  question: "Which deployment environment?"
  options:
    - id: staging
      label: Staging
      description: Deploy to staging environment
    - id: production
      label: Production
      description: Deploy to live environment
  allowMultiple: false
\`\`\`
Output fields: \`intervention.value\` (selected option id or array if \`allowMultiple\`), \`intervention.answeredBy\``;
  }
  generateFeedbackAndRetrospectiveAPIs() {
    return `## Section 7: Flow Feedback & Retrospective APIs

These endpoints are available for capturing structured feedback after flow executions.

### Submit flow feedback
\`\`\`
POST /api/tickets/:ticketId/feedback
\`\`\`
Body:
\`\`\`json
{
  "rating": 4,           // integer 1-5
  "wentWell": ["clear prompt", "fast execution"],
  "wentWrong": ["output format unexpected"],
  "suggestions": ["add retry on parse error"]
}
\`\`\`

### Get all feedback for a flow
\`\`\`
GET /api/flows/:flowId/feedback
\`\`\`
Returns array of feedback entries for the given flow.

### Submit retrospective for a ticket
\`\`\`
POST /api/tickets/:ticketId/retrospective
\`\`\`
Body:
\`\`\`json
{
  "executionSummary": "Flow ran 3 steps, produced a PR",
  "wentWell": ["model step output was accurate"],
  "wentWrong": ["script step failed on first attempt"],
  "suggestions": ["add lint step before commit"]
}
\`\`\`

### Get retrospective for a ticket
\`\`\`
GET /api/tickets/:ticketId/retrospective
\`\`\`
Returns the retrospective for the given ticket execution.`;
  }
};

// ../../node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first2 = string.charCodeAt(pos), second;
  if (first2 >= 55296 && first2 <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first2 - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first2;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var JSON_SCHEMA = json;
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// ../flow-engine/src/validation/ContractValidator.ts
var VALID_RULES_BY_TYPE = {
  // Base types
  string: /* @__PURE__ */ new Set(["required", "pattern", "minLength", "maxLength", "enum", "custom"]),
  number: /* @__PURE__ */ new Set(["required", "min", "max", "enum", "custom"]),
  boolean: /* @__PURE__ */ new Set(["required", "custom"]),
  object: /* @__PURE__ */ new Set(["required", "custom"]),
  // Text types (similar to string)
  text: /* @__PURE__ */ new Set(["required", "pattern", "minLength", "maxLength", "custom"]),
  url: /* @__PURE__ */ new Set(["required", "pattern", "custom"]),
  markdown: /* @__PURE__ */ new Set(["required", "minLength", "maxLength", "custom"]),
  // Number types (similar to number)
  integer: /* @__PURE__ */ new Set(["required", "min", "max", "enum", "custom"]),
  percentage: /* @__PURE__ */ new Set(["required", "min", "max", "custom"]),
  duration: /* @__PURE__ */ new Set(["required", "min", "max", "custom"]),
  // Selection types
  enum: /* @__PURE__ */ new Set(["required", "enum", "custom"]),
  "multi-enum": /* @__PURE__ */ new Set(["required", "enum", "custom"]),
  // File types
  file: /* @__PURE__ */ new Set(["required", "custom"]),
  folder: /* @__PURE__ */ new Set(["required", "custom"]),
  // Date types
  date: /* @__PURE__ */ new Set(["required", "custom"]),
  datetime: /* @__PURE__ */ new Set(["required", "custom"]),
  // Code types
  regex: /* @__PURE__ */ new Set(["required", "pattern", "custom"]),
  // Structure types
  array: /* @__PURE__ */ new Set(["required", "minLength", "maxLength", "custom"]),
  keyvalue: /* @__PURE__ */ new Set(["required", "custom"]),
  // Security types
  password: /* @__PURE__ */ new Set(["required", "minLength", "maxLength", "pattern", "custom"]),
  // Business types
  priority: /* @__PURE__ */ new Set(["required", "enum", "custom"])
};
var ContractValidator = class {
  /**
   * Create a new ContractValidator
   * @param issueCollector - Collector for validation issues
   */
  constructor(issueCollector) {
    this.issueCollector = issueCollector;
  }
  /**
   * Validate step contracts
   * @param flow - Flow definition to validate
   * @param stepIds - Set of valid step IDs
   */
  validateContracts(flow, _stepIds) {
    const inputTypes = this.buildInputTypeMap(flow);
    const stepOutputTypes = this.buildStepOutputTypeMap(flow.steps);
    for (const step of flow.steps) {
      if (step.contract) {
        if (step.contract.preProcess) {
          this.validatePreProcess(step, inputTypes, stepOutputTypes, flow.id);
        }
        if (step.contract.postProcess) {
          this.validatePostProcess(step, flow.id);
        }
      }
    }
  }
  /**
   * Build a map of input types
   */
  buildInputTypeMap(flow) {
    const inputTypes = /* @__PURE__ */ new Map();
    const inputs = flow._autoDiscoveredInputs || {};
    for (const [inputName, inputDef] of Object.entries(inputs)) {
      inputTypes.set(inputName, inputDef.type);
    }
    return inputTypes;
  }
  /**
   * Build a map of step output types
   */
  buildStepOutputTypeMap(steps) {
    const stepOutputTypes = /* @__PURE__ */ new Map();
    for (const step of steps) {
      if (step.output) {
        const outputs = /* @__PURE__ */ new Map();
        for (const [varName, config] of Object.entries(step.output)) {
          if (typeof config === "object" && "type" in config) {
            outputs.set(varName, config.type);
          }
        }
        stepOutputTypes.set(step.id, outputs);
      }
    }
    return stepOutputTypes;
  }
  /**
   * Validate pre-process (input) contract
   */
  validatePreProcess(step, inputTypes, stepOutputTypes, flowId) {
    const preProcess = step.contract.preProcess;
    if (preProcess.validateInputs) {
      for (const [varName, rules] of Object.entries(preProcess.validateInputs)) {
        let varType;
        let varSource;
        if (inputTypes.has(varName)) {
          varType = inputTypes.get(varName);
          varSource = "input";
        } else {
          const parts = varName.split(".");
          if (parts.length === 2) {
            const [stepId, outputName] = parts;
            const stepOutputs2 = stepOutputTypes.get(stepId);
            if (stepOutputs2) {
              varType = stepOutputs2.get(outputName);
            }
          }
        }
        if (!varType) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_VARIABLE" /* UNDEFINED_VARIABLE */,
            message: `Pre-process contract validates unknown variable '${varName}' in step '${step.id}'`,
            location: {
              stepId: step.id,
              field: `contract.preProcess.validateInputs.${varName}`,
              path: `${flowId}.steps[${step.id}].contract.preProcess.validateInputs.${varName}`
            },
            suggestion: `Ensure '${varName}' is defined as a flow input or step output`,
            context: {
              actual: varName,
              related: Array.from(inputTypes.keys())
            }
          });
          continue;
        }
        this.validateRulesForType(step, varName, varType, rules, "preProcess", flowId);
      }
    }
    if (preProcess.required) {
      for (const varName of preProcess.required) {
        if (!inputTypes.has(varName)) {
          const parts = varName.split(".");
          if (parts.length === 2) {
            const [stepId, outputName] = parts;
            const stepOutputs2 = stepOutputTypes.get(stepId);
            if (!stepOutputs2 || !stepOutputs2.has(outputName)) {
              this.issueCollector.addIssue({
                severity: "error",
                code: "UNDEFINED_VARIABLE" /* UNDEFINED_VARIABLE */,
                message: `Pre-process contract requires unknown variable '${varName}' in step '${step.id}'`,
                location: {
                  stepId: step.id,
                  field: `contract.preProcess.required`,
                  path: `${flowId}.steps[${step.id}].contract.preProcess.required`
                },
                suggestion: `Ensure '${varName}' is defined as a flow input or step output`
              });
            }
          } else {
            this.issueCollector.addIssue({
              severity: "error",
              code: "UNDEFINED_INPUT" /* UNDEFINED_INPUT */,
              message: `Pre-process contract requires unknown input '${varName}' in step '${step.id}'`,
              location: {
                stepId: step.id,
                field: `contract.preProcess.required`,
                path: `${flowId}.steps[${step.id}].contract.preProcess.required`
              },
              suggestion: `Add '${varName}' to flow inputs or use step output reference (stepId.outputName)`
            });
          }
        }
      }
    }
  }
  /**
   * Validate post-process (output) contract
   */
  validatePostProcess(step, flowId) {
    const postProcess = step.contract.postProcess;
    if (!step.output) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `Step '${step.id}' has post-process contract but no output configuration`,
        location: {
          stepId: step.id,
          field: "output",
          path: `${flowId}.steps[${step.id}].output`
        },
        suggestion: `Add output configuration to step '${step.id}' or remove post-process contract`
      });
      return;
    }
    const outputTypes = /* @__PURE__ */ new Map();
    for (const [varName, config] of Object.entries(step.output)) {
      if (typeof config === "object" && "type" in config) {
        outputTypes.set(varName, config.type);
      }
    }
    if (postProcess.validateOutputs) {
      for (const [varName, rules] of Object.entries(postProcess.validateOutputs)) {
        const varType = outputTypes.get(varName);
        if (!varType) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_OUTPUT" /* UNDEFINED_OUTPUT */,
            message: `Post-process contract validates undefined output '${varName}' in step '${step.id}'`,
            location: {
              stepId: step.id,
              field: `contract.postProcess.validateOutputs.${varName}`,
              path: `${flowId}.steps[${step.id}].contract.postProcess.validateOutputs.${varName}`
            },
            suggestion: `Add '${varName}' to step output configuration`,
            context: {
              actual: varName,
              related: Array.from(outputTypes.keys())
            }
          });
          continue;
        }
        this.validateRulesForType(step, varName, varType, rules, "postProcess", flowId);
      }
    }
    if (postProcess.required) {
      for (const varName of postProcess.required) {
        if (!outputTypes.has(varName)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_OUTPUT" /* UNDEFINED_OUTPUT */,
            message: `Post-process contract requires undefined output '${varName}' in step '${step.id}'`,
            location: {
              stepId: step.id,
              field: `contract.postProcess.required`,
              path: `${flowId}.steps[${step.id}].contract.postProcess.required`
            },
            suggestion: `Add '${varName}' to step output configuration`
          });
        }
      }
    }
  }
  /**
   * Validate that validation rules are appropriate for the variable type
   */
  validateRulesForType(step, varName, varType, rules, phase, flowId) {
    const validRules = VALID_RULES_BY_TYPE[varType];
    if (!validRules) {
      for (const rule of rules) {
        this.validateRuleValue(step, varName, varType, rule, phase, flowId);
      }
      return;
    }
    for (const rule of rules) {
      if (!validRules.has(rule.type)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_TYPE" /* INVALID_TYPE */,
          message: `Validation rule '${rule.type}' is not valid for ${varType} variable '${varName}' in step '${step.id}'`,
          location: {
            stepId: step.id,
            field: `contract.${phase}.validateInputs.${varName}`,
            path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`
          },
          suggestion: `Valid rules for ${varType}: ${Array.from(validRules).join(", ")}`,
          context: {
            actual: rule.type,
            expected: Array.from(validRules)
          }
        });
      }
      this.validateRuleValue(step, varName, varType, rule, phase, flowId);
    }
  }
  /**
   * Validate rule value constraints
   */
  validateRuleValue(step, varName, varType, rule, phase, flowId) {
    if (rule.type === "pattern" && typeof rule.value !== "string") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `Pattern rule for '${varName}' must have a string value`,
        location: {
          stepId: step.id,
          field: `contract.${phase}.validateInputs.${varName}`,
          path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`
        },
        suggestion: `Provide a regex pattern string (e.g., "^[a-z]+$")`
      });
    }
    if ((rule.type === "min" || rule.type === "max") && typeof rule.value !== "number") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `${rule.type} rule for '${varName}' must have a numeric value`,
        location: {
          stepId: step.id,
          field: `contract.${phase}.validateInputs.${varName}`,
          path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`
        },
        suggestion: `Provide a number value`
      });
    }
    if ((rule.type === "minLength" || rule.type === "maxLength") && typeof rule.value !== "number") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `${rule.type} rule for '${varName}' must have a numeric value`,
        location: {
          stepId: step.id,
          field: `contract.${phase}.validateInputs.${varName}`,
          path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`
        },
        suggestion: `Provide a number value`
      });
    }
    if (rule.type === "enum" && !Array.isArray(rule.value)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `Enum rule for '${varName}' must have an array value`,
        location: {
          stepId: step.id,
          field: `contract.${phase}.validateInputs.${varName}`,
          path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`
        },
        suggestion: `Provide an array of valid values (e.g., ["low", "medium", "high"])`
      });
    }
  }
};

// ../flow-engine/src/validation/DependencyOrderValidator.ts
var DependencyOrderValidator = class {
  constructor(issueCollector) {
    this.issueCollector = issueCollector;
  }
  /**
   * Validate dependency order for all variable references
   */
  validateDependencyOrder(flow) {
    const dependencyMap = this.buildTransitiveDependencyMap(flow.steps);
    const references = this.extractStepOutputReferences(flow);
    for (const ref of references) {
      this.validateReference(ref, dependencyMap);
    }
  }
  /**
   * Build transitive dependency map using DFS
   * For each step, compute the set of all steps it (transitively) depends on
   */
  buildTransitiveDependencyMap(steps) {
    const directDeps = /* @__PURE__ */ new Map();
    const transitiveDeps = /* @__PURE__ */ new Map();
    for (const step of steps) {
      directDeps.set(step.id, new Set(step.depends || []));
    }
    for (const step of steps) {
      const visited = /* @__PURE__ */ new Set();
      this.computeTransitiveDeps(step.id, directDeps, visited);
      transitiveDeps.set(step.id, visited);
    }
    return transitiveDeps;
  }
  /**
   * DFS to compute transitive dependencies
   */
  computeTransitiveDeps(stepId, directDeps, visited) {
    const deps = directDeps.get(stepId) || /* @__PURE__ */ new Set();
    for (const depId of deps) {
      if (!visited.has(depId)) {
        visited.add(depId);
        this.computeTransitiveDeps(depId, directDeps, visited);
      }
    }
  }
  /**
   * Extract all step output references (steps.*.outputs.*)
   */
  extractStepOutputReferences(flow) {
    const references = [];
    const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;
    for (const step of flow.steps) {
      const texts = this.getTemplateTexts(step);
      for (const { text, field } of texts) {
        let match;
        while ((match = templateRegex.exec(text)) !== null) {
          const expression = match[1].trim();
          const parsed = this.parseVariableExpression(expression);
          if (parsed && parsed.type === "step") {
            references.push({
              expression,
              type: "step",
              path: parsed.path,
              location: {
                stepId: step.id,
                field
              }
            });
          }
        }
      }
    }
    return references;
  }
  /**
   * Get template texts from a step based on its type
   */
  getTemplateTexts(step) {
    const texts = [];
    if (step.type === "model") {
      const modelStep = step;
      if (modelStep.prompt) {
        texts.push({ text: modelStep.prompt, field: "prompt" });
      }
    } else if (step.type === "script") {
      const scriptStep = step;
      if (scriptStep.script) {
        texts.push({ text: scriptStep.script, field: "script" });
      }
    } else if (step.type === "subflow") {
      const subflowStep = step;
      if (subflowStep.inputs) {
        const combinedInputs = Object.values(subflowStep.inputs).join(" ");
        texts.push({ text: combinedInputs, field: "inputs" });
      }
    }
    if (step.when) {
      texts.push({ text: step.when, field: "when" });
    }
    return texts;
  }
  /**
   * Parse variable expression
   */
  parseVariableExpression(expression) {
    const parts = expression.split(".");
    if (parts[0] === "inputs") {
      return { type: "input", path: parts.slice(1) };
    } else if (parts[0] === "steps") {
      return { type: "step", path: parts.slice(1) };
    } else if (parts[0] === "task") {
      return { type: "task", path: parts.slice(1) };
    }
    return null;
  }
  /**
   * Validate that consuming step depends on producing step
   */
  validateReference(ref, dependencyMap) {
    const consumerStepId = ref.location.stepId;
    const producerStepId = ref.path[0];
    const dependencies = dependencyMap.get(consumerStepId) || /* @__PURE__ */ new Set();
    if (!dependencies.has(producerStepId)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "UNDEFINED_VARIABLE" /* UNDEFINED_VARIABLE */,
        message: `Step '${consumerStepId}' uses variable from '${producerStepId}' but does not depend on it`,
        location: ref.location,
        suggestion: `Add '${producerStepId}' to the 'depends' array of '${consumerStepId}' (directly or transitively)`,
        context: {
          actual: consumerStepId,
          expected: producerStepId,
          related: Array.from(dependencies)
        }
      });
    }
  }
};

// ../flow-engine/src/validation/GraphValidator.ts
var GraphValidator = class {
  /**
   * Create a new GraphValidator
   * @param issueCollector - Collector for validation issues
   * @param flowRegistry - Optional registry for subflow validation
   */
  constructor(issueCollector, flowRegistry) {
    this.issueCollector = issueCollector;
    this.flowRegistry = flowRegistry;
  }
  /**
   * Validate the complete graph structure of a flow
   * Checks for cycles and unreachable steps
   * @param steps - Flow steps to validate
   */
  validateGraph(steps) {
    this.detectCycles(steps);
    this.checkReachability(steps);
  }
  /**
   * Validate if a subflow step creates circular dependency
   * This should be called by SemanticValidator before checking flow existence
   *
   * @param step - SubFlow step to validate
   * @param currentFlowId - ID of the flow containing this step
   * @returns true if circular dependency detected, false otherwise
   */
  validateSubFlowCircularity(step, currentFlowId) {
    if (step.flowId === currentFlowId) {
      if (step.allowRecursion === true) {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "CIRCULAR_SUBFLOW_REFERENCE" /* CIRCULAR_SUBFLOW_REFERENCE */,
          message: `SubFlow step '${step.id}' is recursive (flow '${currentFlowId}' calls itself). Ensure proper exit condition via 'when' clause to prevent infinite loops.`,
          location: { stepId: step.id, field: "flowId" },
          suggestion: 'Add a "when" condition to ensure recursion eventually stops'
        });
        return false;
      } else {
        this.issueCollector.addIssue({
          severity: "error",
          code: "CIRCULAR_SUBFLOW_REFERENCE" /* CIRCULAR_SUBFLOW_REFERENCE */,
          message: `SubFlow step '${step.id}' creates circular reference (flow '${currentFlowId}' calls itself)`,
          location: { stepId: step.id, field: "flowId" },
          suggestion: 'Add "allowRecursion: true" if recursion is intentional, or use a different flow'
        });
        return true;
      }
    }
    if (this.flowRegistry && step.flowId !== currentFlowId) {
      const visited = /* @__PURE__ */ new Set();
      const path10 = [];
      if (this.detectCircularSubFlowDependency(step.flowId, currentFlowId, visited, path10)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "CIRCULAR_SUBFLOW_REFERENCE" /* CIRCULAR_SUBFLOW_REFERENCE */,
          message: `SubFlow step '${step.id}' creates circular dependency chain: ${path10.join(" \u2192 ")} \u2192 ${currentFlowId}`,
          location: { stepId: step.id, field: "flowId" },
          suggestion: "Break the circular chain by restructuring the flow composition",
          context: { related: path10 }
        });
        return true;
      }
    }
    return false;
  }
  /**
   * Detect cycles in flow dependencies using DFS
   *
   * Note: This is a basic cycle check. Full DAG validation is done by DAGValidator
   * in the FlowExecutor. This is here for early detection during flow definition.
   */
  detectCycles(steps) {
    const graph = this.buildDependencyGraph(steps);
    const visited = /* @__PURE__ */ new Set();
    const recursionStack = /* @__PURE__ */ new Set();
    for (const stepId of graph.keys()) {
      if (!visited.has(stepId)) {
        const cycle = this.detectCycleDFS(stepId, graph, visited, recursionStack, []);
        if (cycle) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "CIRCULAR_DEPENDENCY" /* CIRCULAR_DEPENDENCY */,
            message: `Circular dependency detected: ${cycle.join(" \u2192 ")}`,
            location: { stepId: cycle[0] },
            suggestion: "Remove or modify dependencies to break the cycle",
            context: { related: cycle }
          });
          return;
        }
      }
    }
  }
  /**
   * Build dependency graph for cycle detection
   */
  buildDependencyGraph(steps) {
    const graph = /* @__PURE__ */ new Map();
    for (const step of steps) {
      const dependencies = /* @__PURE__ */ new Set();
      if (step.depends) {
        for (const depId of step.depends) {
          dependencies.add(depId);
        }
      }
      graph.set(step.id, dependencies);
    }
    return graph;
  }
  /**
   * DFS for cycle detection
   */
  detectCycleDFS(stepId, graph, visited, recursionStack, path10) {
    visited.add(stepId);
    recursionStack.add(stepId);
    path10.push(stepId);
    const dependencies = graph.get(stepId) || /* @__PURE__ */ new Set();
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        const cycle = this.detectCycleDFS(depId, graph, visited, recursionStack, path10);
        if (cycle) return cycle;
      } else if (recursionStack.has(depId)) {
        const cycleStart = path10.indexOf(depId);
        return path10.slice(cycleStart).concat(depId);
      }
    }
    recursionStack.delete(stepId);
    path10.pop();
    return null;
  }
  /**
   * Check for unreachable steps
   *
   * In DAG-based flows, a step is unreachable if it has no path from any root node.
   * Root nodes are steps with no dependencies.
   */
  checkReachability(steps) {
    if (steps.length === 0) return;
    const roots = [];
    for (const step of steps) {
      if (!step.depends || step.depends.length === 0) {
        roots.push(step.id);
      }
    }
    if (roots.length === 0) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "CIRCULAR_DEPENDENCY" /* CIRCULAR_DEPENDENCY */,
        message: "No root steps found - all steps have dependencies (likely a circular dependency)",
        suggestion: "At least one step should have no dependencies"
      });
      return;
    }
    const dependents = /* @__PURE__ */ new Map();
    for (const step of steps) {
      dependents.set(step.id, /* @__PURE__ */ new Set());
    }
    for (const step of steps) {
      if (step.depends) {
        for (const depId of step.depends) {
          const depsSet = dependents.get(depId);
          if (depsSet) {
            depsSet.add(step.id);
          }
        }
      }
    }
    const reachable = /* @__PURE__ */ new Set();
    for (const rootId of roots) {
      this.markReachableFromRoot(rootId, dependents, reachable);
    }
    for (const step of steps) {
      if (!reachable.has(step.id)) {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "UNREACHABLE_STEP" /* UNREACHABLE_STEP */,
          message: `Step '${step.id}' is unreachable (no path from root nodes)`,
          location: { stepId: step.id },
          suggestion: "Ensure this step has a dependency path from at least one root step, or remove it"
        });
      }
    }
  }
  /**
   * Mark all reachable steps from a root node (following dependents)
   */
  markReachableFromRoot(stepId, dependents, reachable) {
    if (reachable.has(stepId)) return;
    reachable.add(stepId);
    const deps = dependents.get(stepId) || /* @__PURE__ */ new Set();
    for (const depId of deps) {
      this.markReachableFromRoot(depId, dependents, reachable);
    }
  }
  /**
   * Detect circular dependencies in SubFlowStep chains
   *
   * This performs a depth-first search through the flow composition graph to detect cycles.
   * Example: Flow A calls Flow B, which calls Flow C, which calls Flow A → circular!
   *
   * @param flowId - The flow ID to check (starting point)
   * @param targetFlowId - The flow ID we're looking for (to detect a cycle)
   * @param visited - Set of already visited flow IDs (to avoid infinite loops)
   * @param path - Current path through the flow graph (for error reporting)
   * @returns true if a circular dependency is detected, false otherwise
   */
  detectCircularSubFlowDependency(flowId, targetFlowId, visited, path10) {
    if (visited.has(flowId)) {
      return false;
    }
    if (flowId === targetFlowId) {
      return true;
    }
    visited.add(flowId);
    path10.push(flowId);
    if (!this.flowRegistry) {
      return false;
    }
    const flow = this.flowRegistry.getFlow(flowId);
    if (!flow) {
      return false;
    }
    for (const step of flow.steps) {
      if (step.type === "subflow") {
        const subFlowStep = step;
        const newVisited = new Set(visited);
        const newPath = [...path10];
        if (this.detectCircularSubFlowDependency(subFlowStep.flowId, targetFlowId, newVisited, newPath)) {
          path10.length = 0;
          path10.push(...newPath);
          return true;
        }
      }
    }
    return false;
  }
};

// ../flow-engine/src/validation/LogicalValidator.ts
var TRANSFORM_OUTPUT_TYPES = {
  parseInt: "number",
  parseFloat: "number",
  parseBoolean: "boolean",
  parseJSON: "object",
  parseYAML: "object",
  trim: "string",
  toLowerCase: "string",
  toUpperCase: "string",
  split: "object"
};
var LogicalValidator = class {
  /**
   * Create a new LogicalValidator
   * @param issueCollector - Collector for validation issues
   */
  constructor(issueCollector) {
    this.issueCollector = issueCollector;
  }
  /**
   * Validate logical consistency of a flow
   * @param flow - Flow definition to validate
   * @param stepIds - Set of valid step IDs
   */
  validateLogical(flow, _stepIds) {
    const stepOutputs2 = this.buildStepOutputMap(flow.steps);
    for (const step of flow.steps) {
      if (step.output) {
        this.validateOutputConfiguration(step, flow.id);
      }
      if (step.when) {
        this.validateConditionalExpression(step, stepOutputs2, flow.id);
      }
      if (step.depends && step.depends.length > 0) {
        this.validateDataTypeFlow(step, stepOutputs2, flow.steps, flow.id);
      }
    }
    this.validateInputCoverage(flow);
  }
  /**
   * Build a map of step outputs with their types
   */
  buildStepOutputMap(steps) {
    const stepOutputs2 = /* @__PURE__ */ new Map();
    for (const step of steps) {
      if (step.output) {
        const outputs = /* @__PURE__ */ new Map();
        for (const [varName, config] of Object.entries(step.output)) {
          if (typeof config === "object" && "type" in config) {
            outputs.set(varName, config.type);
          }
        }
        stepOutputs2.set(step.id, outputs);
      }
    }
    return stepOutputs2;
  }
  /**
   * Validate output configuration for logical consistency
   */
  validateOutputConfiguration(step, flowId) {
    if (!step.output) return;
    for (const [varName, config] of Object.entries(step.output)) {
      if (typeof config === "string") continue;
      const outputConfig = config;
      if (outputConfig.pattern) {
        this.validatePatternCompleteness(step, varName, outputConfig, flowId);
      }
      if (outputConfig.transform) {
        this.validateTransformConsistency(step, varName, outputConfig, flowId);
      }
      if (outputConfig.pattern === "(.*)") {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "MISSING_OUTPUT" /* MISSING_OUTPUT */,
          message: `Output pattern for '${varName}' is too broad`,
          location: {
            stepId: step.id,
            field: `output.${varName}.pattern`,
            path: `${flowId}.steps[${step.id}].output.${varName}.pattern`
          },
          suggestion: `Use a more specific pattern to extract '${varName}' (current pattern '(.*)' captures entire output)`,
          context: {
            actual: outputConfig.pattern,
            expected: 'A pattern with context (e.g., "result=(.*)" or "value: (\\d+)")'
          }
        });
      }
    }
  }
  /**
   * Validate that regex patterns have capture groups
   */
  validatePatternCompleteness(step, varName, config, flowId) {
    const pattern = config.pattern;
    const hasCaptureGroup = /\((?!\?)/.test(pattern);
    if (!hasCaptureGroup) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Output pattern for '${varName}' in step '${step.id}' has no capture group`,
        location: {
          stepId: step.id,
          field: `output.${varName}.pattern`,
          path: `${flowId}.steps[${step.id}].output.${varName}.pattern`
        },
        suggestion: `Add parentheses to capture the value (e.g., change 'result=.*' to 'result=(.*)')`,
        context: {
          actual: pattern,
          expected: "Pattern with capture group: ()"
        }
      });
    }
    if (pattern.includes(".*") && !pattern.includes("(.*?)")) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Output pattern for '${varName}' uses greedy '.*' which may capture more than intended`,
        location: {
          stepId: step.id,
          field: `output.${varName}.pattern`,
          path: `${flowId}.steps[${step.id}].output.${varName}.pattern`
        },
        suggestion: `Consider using non-greedy '(.*?)' or more specific patterns`,
        context: {
          actual: pattern
        }
      });
    }
  }
  /**
   * Validate transform functions match declared types
   */
  validateTransformConsistency(step, varName, config, flowId) {
    const transform = config.transform;
    const declaredType = config.type;
    const expectedType = TRANSFORM_OUTPUT_TYPES[transform];
    if (expectedType && expectedType !== declaredType) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "TYPE_MISMATCH" /* TYPE_MISMATCH */,
        message: `Transform '${transform}' produces '${expectedType}' but output '${varName}' is declared as '${declaredType}'`,
        location: {
          stepId: step.id,
          field: `output.${varName}`,
          path: `${flowId}.steps[${step.id}].output.${varName}`
        },
        suggestion: `Change type to '${expectedType}' or use a different transform`,
        context: {
          actual: declaredType,
          expected: expectedType,
          related: [transform]
        }
      });
    }
    if (transform === "trim" && declaredType !== "string") {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Transform 'trim' is used on non-string type '${declaredType}'`,
        location: {
          stepId: step.id,
          field: `output.${varName}.transform`,
          path: `${flowId}.steps[${step.id}].output.${varName}.transform`
        },
        suggestion: `Remove 'trim' transform or change type to 'string'`
      });
    }
  }
  /**
   * Validate conditional expressions reference valid outputs
   */
  validateConditionalExpression(step, stepOutputs2, flowId) {
    const condition = step.when;
    const stepRefPattern = /steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)/g;
    const matches = [...condition.matchAll(stepRefPattern)];
    for (const match of matches) {
      const referencedStepId = match[1];
      const referencedOutput = match[2];
      if (!stepOutputs2.has(referencedStepId)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
          message: `Conditional expression references undefined step '${referencedStepId}'`,
          location: {
            stepId: step.id,
            field: "when",
            path: `${flowId}.steps[${step.id}].when`
          },
          suggestion: `Ensure step '${referencedStepId}' exists and is defined before step '${step.id}'`,
          context: {
            actual: condition,
            related: Array.from(stepOutputs2.keys())
          }
        });
        continue;
      }
      const outputs = stepOutputs2.get(referencedStepId);
      if (!outputs.has(referencedOutput)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "UNDEFINED_OUTPUT" /* UNDEFINED_OUTPUT */,
          message: `Conditional expression references undefined output '${referencedOutput}' in step '${referencedStepId}'`,
          location: {
            stepId: step.id,
            field: "when",
            path: `${flowId}.steps[${step.id}].when`
          },
          suggestion: `Add '${referencedOutput}' to step '${referencedStepId}' output configuration`,
          context: {
            actual: condition,
            related: Array.from(outputs.keys())
          }
        });
      }
    }
  }
  /**
   * Validate data type flow across step boundaries
   */
  validateDataTypeFlow(step, stepOutputs2, allSteps, flowId) {
    if (step.type === "script") {
      const script = step.script;
      const stepRefPattern = /\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g;
      const matches = [...script.matchAll(stepRefPattern)];
      for (const match of matches) {
        const referencedStepId = match[1];
        const referencedOutput = match[2];
        const outputs = stepOutputs2.get(referencedStepId);
        if (outputs && outputs.has(referencedOutput)) {
          const outputType = outputs.get(referencedOutput);
          if (outputType === "object") {
            this.issueCollector.addIssue({
              severity: "warning",
              code: "TYPE_MISMATCH" /* TYPE_MISMATCH */,
              message: `Script in step '${step.id}' uses object output '${referencedOutput}' from step '${referencedStepId}'`,
              location: {
                stepId: step.id,
                field: "script",
                path: `${flowId}.steps[${step.id}].script`
              },
              suggestion: `Object outputs may need JSON parsing in scripts. Consider using parseJSON transform if needed.`,
              context: {
                actual: "object",
                expected: "string or number"
              }
            });
          }
        }
      }
    }
    if (step.type === "model") {
      const prompt = step.prompt;
      const stepRefPattern = /\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g;
      const matches = [...prompt.matchAll(stepRefPattern)];
      for (const match of matches) {
        const referencedStepId = match[1];
        const referencedOutput = match[2];
        const outputs = stepOutputs2.get(referencedStepId);
        if (outputs && outputs.has(referencedOutput)) {
          const outputType = outputs.get(referencedOutput);
          if (outputType === "object") {
            this.issueCollector.addIssue({
              severity: "info",
              code: "TYPE_MISMATCH" /* TYPE_MISMATCH */,
              message: `Model prompt in step '${step.id}' uses object output '${referencedOutput}'`,
              location: {
                stepId: step.id,
                field: "prompt",
                path: `${flowId}.steps[${step.id}].prompt`
              },
              suggestion: `Object outputs in prompts are automatically stringified. Consider formatting if needed.`,
              context: {
                actual: "object"
              }
            });
          }
        }
      }
    }
  }
  /**
   * Validate that all required inputs are provided or have defaults
   */
  validateInputCoverage(flow) {
    const inputs = flow._autoDiscoveredInputs || {};
    for (const [inputName, inputDef] of Object.entries(inputs)) {
      if (inputDef.required && inputDef.default === void 0) {
        continue;
      }
      if (inputDef.required && inputDef.default !== void 0) {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `Input '${inputName}' is marked required but has a default value`,
          location: {
            field: `inputs.${inputName}`,
            path: `${flow.id}.inputs.${inputName}`
          },
          suggestion: `Remove 'required: true' or remove 'default' value (required inputs with defaults are always satisfied)`,
          context: {
            actual: { required: true, default: inputDef.default },
            expected: "Either required: true OR default: value, not both"
          }
        });
      }
    }
  }
};

// ../flow-engine/src/validation/SchemaValidator.ts
var SchemaValidator = class {
  /**
   * Create a new SchemaValidator
   * @param issueCollector - Collector for validation issues
   * @param validTaskStatuses - Valid task status values; if empty, status values are not validated
   */
  constructor(issueCollector, validTaskStatuses = []) {
    this.issueCollector = issueCollector;
    this.validTaskStatuses = validTaskStatuses;
  }
  /**
   * Validate flow schema
   * @param flow - Flow definition to validate
   * @returns Object containing step IDs and normalized inputs
   */
  validateSchema(flow) {
    if (!flow.id || typeof flow.id !== "string" || flow.id.trim() === "") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Flow must have a non-empty ID",
        location: { field: "id" },
        suggestion: 'Add a unique identifier for this flow (e.g., "my-flow")'
      });
    }
    if (!flow.name || typeof flow.name !== "string") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Flow must have a name",
        location: { field: "name" },
        suggestion: "Add a descriptive name for this flow"
      });
    }
    if (!flow.description || typeof flow.description !== "string") {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Flow should have a description",
        location: { field: "description" },
        suggestion: "Add a description to help users understand the flow purpose"
      });
    }
    this.validateWorkspaceConfig(flow.workspace, flow.id);
    if (flow.statusTransitions) {
      this.validateStatusTransitions(flow.statusTransitions, flow.id);
    }
    const normalizedInputs = this.validateInputs(flow.inputs, flow.id);
    const stepIds = this.validateSteps(flow.steps, flow.id);
    return { stepIds, normalizedInputs };
  }
  /**
   * Validate workspace configuration
   */
  validateWorkspaceConfig(config, flowId) {
    if (!config) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Flow must have workspace configuration",
        location: { field: "workspace" },
        suggestion: "Add workspace configuration with mode, gitStrategy, and reusePolicy"
      });
      return;
    }
    const validModes = ["isolated", "shared", "manual"];
    if (!config.mode) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Workspace must have a mode",
        location: { field: "workspace.mode" },
        suggestion: `Choose one of: ${validModes.join(", ")}`,
        context: { related: validModes }
      });
    } else if (!validModes.includes(config.mode)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid workspace mode: ${config.mode}`,
        location: { field: "workspace.mode" },
        suggestion: `Must be one of: ${validModes.join(", ")}`,
        context: {
          actual: config.mode,
          expected: validModes,
          related: validModes
        }
      });
    }
    const validStrategies = ["main-only", "feature-branch", "any", "worktree", "none"];
    if (!config.gitStrategy) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Workspace must have a git strategy",
        location: { field: "workspace.gitStrategy" },
        suggestion: `Choose one of: ${validStrategies.join(", ")}`,
        context: { related: validStrategies }
      });
    } else if (!validStrategies.includes(config.gitStrategy)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid git strategy: ${config.gitStrategy}`,
        location: { field: "workspace.gitStrategy" },
        suggestion: `Must be one of: ${validStrategies.join(", ")}`,
        context: {
          actual: config.gitStrategy,
          expected: validStrategies,
          related: validStrategies
        }
      });
    }
    const validPolicies = ["never", "if-available", "always"];
    if (!config.reusePolicy) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Workspace must have a reuse policy",
        location: { field: "workspace.reusePolicy" },
        suggestion: `Choose one of: ${validPolicies.join(", ")}`,
        context: { related: validPolicies }
      });
    } else if (!validPolicies.includes(config.reusePolicy)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid reuse policy: ${config.reusePolicy}`,
        location: { field: "workspace.reusePolicy" },
        suggestion: `Must be one of: ${validPolicies.join(", ")}`,
        context: {
          actual: config.reusePolicy,
          expected: validPolicies,
          related: validPolicies
        }
      });
    }
    if (config.concurrencyKey !== void 0 && typeof config.concurrencyKey !== "string") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: "Workspace concurrencyKey must be a string",
        location: { field: "workspace.concurrencyKey" },
        context: {
          expected: "string",
          actual: typeof config.concurrencyKey
        }
      });
    }
  }
  /**
   * Validate status transitions configuration
   */
  validateStatusTransitions(config, flowId) {
    if (!config) {
      return;
    }
    const validStatuses = this.validTaskStatuses;
    if (!config.onSuccess) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "statusTransitions must have onSuccess field",
        location: { field: "statusTransitions.onSuccess" },
        suggestion: validStatuses.length > 0 ? `Choose one of: ${validStatuses.join(", ")}` : "Provide a valid status string",
        context: { related: validStatuses }
      });
    } else if (validStatuses.length > 0 && !validStatuses.includes(config.onSuccess)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid onSuccess status: ${config.onSuccess}`,
        location: { field: "statusTransitions.onSuccess" },
        suggestion: `Must be a valid TaskStatus: ${validStatuses.join(", ")}`,
        context: {
          actual: config.onSuccess,
          expected: validStatuses,
          related: validStatuses
        }
      });
    }
    if (!config.onFailure) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "statusTransitions must have onFailure field",
        location: { field: "statusTransitions.onFailure" },
        suggestion: validStatuses.length > 0 ? `Choose one of: ${validStatuses.join(", ")}` : "Provide a valid status string",
        context: { related: validStatuses }
      });
    } else if (validStatuses.length > 0 && !validStatuses.includes(config.onFailure)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid onFailure status: ${config.onFailure}`,
        location: { field: "statusTransitions.onFailure" },
        suggestion: `Must be a valid TaskStatus: ${validStatuses.join(", ")}`,
        context: {
          actual: config.onFailure,
          expected: validStatuses,
          related: validStatuses
        }
      });
    }
  }
  /**
   * Validate and normalize inputs
   * Validates input format and returns normalized definitions
   * @returns Record of normalized input definitions
   */
  validateInputs(inputs, flowId) {
    const normalized = {};
    if (!inputs) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: "Flow has no inputs defined",
        location: { field: "inputs" },
        suggestion: "Consider adding inputs if the flow needs parameters"
      });
      return normalized;
    }
    const validTypes = [
      // Base types
      "string",
      "number",
      "boolean",
      "object",
      // Text types
      "text",
      "url",
      "markdown",
      // Number types
      "integer",
      "percentage",
      "duration",
      // Selection types
      "enum",
      "multi-enum",
      // File types
      "file",
      "folder",
      // Date types
      "date",
      "datetime",
      // Code types
      "regex",
      // Structure types
      "array",
      "keyvalue",
      // Security types
      "password",
      // Business types
      "priority"
    ];
    for (const [name, inputSpec] of Object.entries(inputs)) {
      if (typeof inputSpec === "string") {
        if (!validTypes.includes(inputSpec)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "INVALID_VALUE" /* INVALID_VALUE */,
            message: `Invalid input type for '${name}': ${inputSpec}`,
            location: { field: `inputs.${name}` },
            suggestion: `Must be one of: ${validTypes.join(", ")}`,
            context: {
              actual: inputSpec,
              expected: validTypes,
              related: validTypes
            }
          });
        } else {
          normalized[name] = {
            type: inputSpec,
            required: false,
            source: "explicit"
          };
        }
      } else if (typeof inputSpec === "object" && inputSpec !== null) {
        const def = inputSpec;
        if (!def.type) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "MISSING_FIELD" /* MISSING_FIELD */,
            message: `Input '${name}' is missing required 'type' field`,
            location: { field: `inputs.${name}` },
            suggestion: "Add a type field: string, number, boolean, or object"
          });
        } else if (!validTypes.includes(def.type)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "INVALID_VALUE" /* INVALID_VALUE */,
            message: `Invalid input type for '${name}': ${def.type}`,
            location: { field: `inputs.${name}.type` },
            suggestion: `Must be one of: ${validTypes.join(", ")}`,
            context: {
              actual: def.type,
              expected: validTypes,
              related: validTypes
            }
          });
        } else {
          normalized[name] = {
            type: def.type,
            required: def.required ?? false,
            default: def.default,
            description: def.description,
            options: def.options,
            source: "explicit"
          };
          if (def.default !== void 0) {
            const defaultType = typeof def.default;
            const expectedType = def.type === "object" ? "object" : def.type;
            if (defaultType !== expectedType) {
              this.issueCollector.addIssue({
                severity: "warning",
                code: "TYPE_MISMATCH" /* TYPE_MISMATCH */,
                message: `Default value type '${defaultType}' for input '${name}' does not match declared type '${def.type}'`,
                location: { field: `inputs.${name}.default` },
                suggestion: `Ensure default value matches the declared type`,
                context: {
                  actual: defaultType,
                  expected: expectedType
                }
              });
            }
          }
        }
      } else {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `Invalid input specification for '${name}': expected string or object`,
          location: { field: `inputs.${name}` },
          suggestion: 'Use either shorthand (e.g., "string") or extended format (e.g., { type: "string", required: true })'
        });
      }
    }
    return normalized;
  }
  /**
   * Validate steps
   * @returns Set of step IDs found in the flow
   */
  validateSteps(steps, flowId) {
    if (!steps || steps.length === 0) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "EMPTY_COLLECTION" /* EMPTY_COLLECTION */,
        message: "Flow must have at least one step",
        location: { field: "steps" },
        suggestion: "Add steps to define the flow behavior"
      });
      return /* @__PURE__ */ new Set();
    }
    const stepIds = /* @__PURE__ */ new Set();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.id || typeof step.id !== "string" || step.id.trim() === "") {
        this.issueCollector.addIssue({
          severity: "error",
          code: "MISSING_FIELD" /* MISSING_FIELD */,
          message: `Step at index ${i} must have a non-empty ID`,
          location: { path: `steps[${i}].id` },
          suggestion: "Add a unique identifier for this step"
        });
        continue;
      }
      if (stepIds.has(step.id)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "DUPLICATE_ID" /* DUPLICATE_ID */,
          message: `Duplicate step ID: ${step.id}`,
          location: { stepId: step.id, path: `steps[${i}].id` },
          suggestion: "Each step must have a unique ID",
          context: { related: Array.from(stepIds) }
        });
      }
      stepIds.add(step.id);
      if (!step.name || typeof step.name !== "string") {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "MISSING_FIELD" /* MISSING_FIELD */,
          message: `Step '${step.id}' should have a name`,
          location: { stepId: step.id, field: "name" },
          suggestion: "Add a descriptive name for this step"
        });
      }
      if (step.output) {
        for (const [outputName, outputConfig] of Object.entries(step.output)) {
          if (typeof outputConfig === "string" || !outputConfig.writeOutput) continue;
          {
            const normalized = outputConfig.writeOutput.replace(/\\/g, "/");
            if (normalized.includes("..") || normalized.startsWith("/")) {
              this.issueCollector.addIssue({
                severity: "error",
                code: "INVALID_VALUE" /* INVALID_VALUE */,
                message: `Step '${step.id}' output '${outputName}' writeOutput path '${outputConfig.writeOutput}' is invalid: must be a relative path within the workspace`,
                location: { stepId: step.id, field: `output.${outputName}.writeOutput` },
                suggestion: `Use a simple relative path like 'response.txt' or 'subdir/response.txt'`
              });
            }
          }
        }
      }
      this.validateStepType(step);
    }
    return stepIds;
  }
  /**
   * Validate step based on type
   */
  validateStepType(step) {
    if (step.type === "model") {
      this.validateModelStep(step);
    } else if (step.type === "script") {
      this.validateScriptStep(step);
    } else if (step.type === "subflow") {
      this.validateSubFlowStepSchema(step);
    } else if (step.type === "user_intervention") {
      this.validateUserInterventionStep(step);
    } else {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid step type: ${step.type}`,
        location: { stepId: step.id, field: "type" },
        suggestion: 'Type must be either "model", "script", "subflow", or "user_intervention"',
        context: {
          actual: step.type,
          expected: ["model", "script", "subflow", "user_intervention"]
        }
      });
    }
  }
  /**
   * Validate model step
   */
  validateModelStep(step) {
    if (!step.prompt || typeof step.prompt !== "string" || step.prompt.trim() === "") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `Model step '${step.id}' must have a non-empty prompt`,
        location: { stepId: step.id, field: "prompt" },
        suggestion: "Add a prompt template for the AI model"
      });
    }
    const validModels = ["sonnet", "haiku", "opus"];
    if (!step.model) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `Model step '${step.id}' must specify a model`,
        location: { stepId: step.id, field: "model" },
        suggestion: `Choose one of: ${validModels.join(", ")}`,
        context: { related: validModels }
      });
    } else if (!validModels.includes(step.model)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `Invalid model for step '${step.id}': ${step.model}`,
        location: { stepId: step.id, field: "model" },
        suggestion: `Must be one of: ${validModels.join(", ")}`,
        context: {
          actual: step.model,
          expected: validModels,
          related: validModels
        }
      });
    }
  }
  /**
   * Validate script step
   */
  validateScriptStep(step) {
    if (!step.script || typeof step.script !== "string" || step.script.trim() === "") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `Script step '${step.id}' must have a non-empty script command`,
        location: { stepId: step.id, field: "script" },
        suggestion: "Add a shell command or script to execute"
      });
    }
    if (step.workingDir !== void 0 && typeof step.workingDir !== "string") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `Script step '${step.id}' workingDir must be a string`,
        location: { stepId: step.id, field: "workingDir" },
        context: {
          expected: "string",
          actual: typeof step.workingDir
        }
      });
    }
    if (step.env !== void 0 && typeof step.env !== "object") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `Script step '${step.id}' env must be an object`,
        location: { stepId: step.id, field: "env" },
        context: {
          expected: "object",
          actual: typeof step.env
        }
      });
    }
  }
  /**
   * Validate subflow step schema (structure only, not references)
   */
  validateSubFlowStepSchema(step) {
    if (!step.flowId || typeof step.flowId !== "string" || step.flowId.trim() === "") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `SubFlow step '${step.id}' must have a non-empty flowId`,
        location: { stepId: step.id, field: "flowId" },
        suggestion: "Specify the ID of the flow to execute"
      });
    }
    if (step.workspaceStrategy !== void 0) {
      const validStrategies = ["inherit", "separate"];
      if (!validStrategies.includes(step.workspaceStrategy)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `SubFlow step '${step.id}' has invalid workspaceStrategy: ${step.workspaceStrategy}`,
          location: { stepId: step.id, field: "workspaceStrategy" },
          suggestion: `Must be one of: ${validStrategies.join(", ")}`,
          context: {
            actual: step.workspaceStrategy,
            expected: validStrategies,
            related: validStrategies
          }
        });
      }
    }
    if (step.inputs !== void 0 && typeof step.inputs !== "object") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `SubFlow step '${step.id}' inputs must be an object`,
        location: { stepId: step.id, field: "inputs" },
        context: {
          expected: "object",
          actual: typeof step.inputs
        }
      });
    }
  }
  /**
   * Validate user intervention step schema (structure only)
   */
  validateUserInterventionStep(step) {
    const validTypes = ["approval", "question", "choice"];
    if (!step.interventionType || !validTypes.includes(step.interventionType)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "MISSING_FIELD" /* MISSING_FIELD */,
        message: `UserIntervention step '${step.id}' must have a valid interventionType`,
        location: { stepId: step.id, field: "interventionType" },
        suggestion: `Must be one of: ${validTypes.join(", ")}`,
        context: {
          actual: step.interventionType,
          expected: validTypes
        }
      });
    }
    if (step.interventionType === "approval") {
      if (!step.approval) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "MISSING_FIELD" /* MISSING_FIELD */,
          message: `UserIntervention step '${step.id}' of type 'approval' must have an 'approval' config`,
          location: { stepId: step.id, field: "approval" },
          suggestion: "Add an approval configuration with title and optional description"
        });
      } else {
        if (!step.approval.title || typeof step.approval.title !== "string") {
          this.issueCollector.addIssue({
            severity: "error",
            code: "MISSING_FIELD" /* MISSING_FIELD */,
            message: `Approval step '${step.id}' must have a non-empty title`,
            location: { stepId: step.id, field: "approval.title" },
            suggestion: "Add a title describing what needs approval"
          });
        }
      }
    } else if (step.interventionType === "question") {
      if (!step.question) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "MISSING_FIELD" /* MISSING_FIELD */,
          message: `UserIntervention step '${step.id}' of type 'question' must have a 'question' config`,
          location: { stepId: step.id, field: "question" },
          suggestion: "Add a question configuration with question text and responseType"
        });
      } else {
        if (!step.question.question || typeof step.question.question !== "string") {
          this.issueCollector.addIssue({
            severity: "error",
            code: "MISSING_FIELD" /* MISSING_FIELD */,
            message: `Question step '${step.id}' must have a non-empty question`,
            location: { stepId: step.id, field: "question.question" },
            suggestion: "Add a question text"
          });
        }
        const validResponseTypes = ["text", "number", "boolean"];
        if (!step.question.responseType || !validResponseTypes.includes(step.question.responseType)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "INVALID_VALUE" /* INVALID_VALUE */,
            message: `Question step '${step.id}' must have a valid responseType`,
            location: { stepId: step.id, field: "question.responseType" },
            suggestion: `Must be one of: ${validResponseTypes.join(", ")}`,
            context: {
              actual: step.question.responseType,
              expected: validResponseTypes
            }
          });
        }
      }
    } else if (step.interventionType === "choice") {
      if (!step.choice) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "MISSING_FIELD" /* MISSING_FIELD */,
          message: `UserIntervention step '${step.id}' of type 'choice' must have a 'choice' config`,
          location: { stepId: step.id, field: "choice" },
          suggestion: "Add a choice configuration with question and options"
        });
      } else {
        if (!step.choice.question || typeof step.choice.question !== "string") {
          this.issueCollector.addIssue({
            severity: "error",
            code: "MISSING_FIELD" /* MISSING_FIELD */,
            message: `Choice step '${step.id}' must have a non-empty question`,
            location: { stepId: step.id, field: "choice.question" },
            suggestion: "Add a question text"
          });
        }
        if (!Array.isArray(step.choice.options) || step.choice.options.length === 0) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "EMPTY_COLLECTION" /* EMPTY_COLLECTION */,
            message: `Choice step '${step.id}' must have at least one option`,
            location: { stepId: step.id, field: "choice.options" },
            suggestion: "Add at least one choice option with id and label"
          });
        }
      }
    }
    if (step.blocking !== void 0 && typeof step.blocking !== "boolean") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `UserIntervention step '${step.id}' blocking must be a boolean`,
        location: { stepId: step.id, field: "blocking" },
        context: {
          expected: "boolean",
          actual: typeof step.blocking
        }
      });
    }
    if (step.timeout) {
      if (typeof step.timeout.minutes !== "number" || step.timeout.minutes <= 0) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `UserIntervention step '${step.id}' timeout minutes must be a positive number`,
          location: { stepId: step.id, field: "timeout.minutes" },
          suggestion: "Set a positive number of minutes for timeout"
        });
      }
      const validTimeoutActions = ["fail", "continue", "default"];
      if (!step.timeout.onTimeout || !validTimeoutActions.includes(step.timeout.onTimeout)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `UserIntervention step '${step.id}' timeout.onTimeout must be valid`,
          location: { stepId: step.id, field: "timeout.onTimeout" },
          suggestion: `Must be one of: ${validTimeoutActions.join(", ")}`,
          context: {
            actual: step.timeout.onTimeout,
            expected: validTimeoutActions
          }
        });
      }
    }
    if (step.output) {
      const availableSources = /* @__PURE__ */ new Set([
        "intervention.value",
        "intervention.comment",
        "intervention.answeredBy",
        "intervention.answeredAt",
        "intervention.userResponse",
        "intervention.approved",
        "intervention.rejected",
        "intervention.answer",
        "intervention.choice"
      ]);
      for (const [outputName, outputConfig] of Object.entries(step.output)) {
        if (outputConfig.pattern) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "INVALID_VALUE" /* INVALID_VALUE */,
            message: `UserIntervention step '${step.id}' output '${outputName}' must not have a pattern`,
            location: { stepId: step.id, field: `output.${outputName}.pattern` },
            suggestion: `Remove 'pattern' and use 'from' instead to specify the source explicitly.`
          });
        }
        if (outputConfig.jsonpath) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "INVALID_VALUE" /* INVALID_VALUE */,
            message: `UserIntervention step '${step.id}' output '${outputName}' must not have a jsonpath`,
            location: { stepId: step.id, field: `output.${outputName}.jsonpath` },
            suggestion: `Remove 'jsonpath' and use 'from' instead to specify the source explicitly.`
          });
        }
        if (!outputConfig.from) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "MISSING_FIELD" /* MISSING_FIELD */,
            message: `UserIntervention step '${step.id}' output '${outputName}' must have a 'from' field`,
            location: { stepId: step.id, field: `output.${outputName}.from` },
            suggestion: `Add 'from' field. Examples: 'intervention.approved', 'intervention.comment', 'intervention.answeredBy'. Available sources: ${Array.from(availableSources).join(", ")}`
          });
        } else {
          if (!availableSources.has(outputConfig.from)) {
            this.issueCollector.addIssue({
              severity: "error",
              code: "INVALID_VALUE" /* INVALID_VALUE */,
              message: `UserIntervention step '${step.id}' output '${outputName}' has invalid 'from' value: '${outputConfig.from}'`,
              location: { stepId: step.id, field: `output.${outputName}.from` },
              suggestion: `Must be one of: ${Array.from(availableSources).join(", ")}`,
              context: {
                actual: outputConfig.from,
                expected: Array.from(availableSources)
              }
            });
          }
        }
      }
    }
  }
};

// ../flow-engine/src/validation/SemanticValidator.ts
var SemanticValidator = class {
  /**
   * Create a new SemanticValidator
   * @param issueCollector - Collector for validation issues
   * @param graphValidator - Graph validator for circular subflow checks
   * @param flowRegistry - Optional registry for subflow validation
   */
  constructor(issueCollector, graphValidator, flowRegistry) {
    this.issueCollector = issueCollector;
    this.graphValidator = graphValidator;
    this.flowRegistry = flowRegistry;
  }
  /**
   * Validate semantic correctness of a flow
   * This is the main entry point for semantic validation
   *
   * @param flow - Flow definition to validate
   * @param stepIds - Set of valid step IDs (from schema validation)
   */
  validateSemantics(flow, stepIds) {
    this.validateStepReferences(flow.steps, stepIds);
    for (const step of flow.steps) {
      if (step.type === "subflow") {
        this.validateSubFlowReferences(step, flow.id, stepIds);
      }
    }
  }
  /**
   * Validate step references (depends, previousOutputs, onFailure.goto)
   *
   * @param steps - Flow steps to validate
   * @param stepIds - Set of valid step IDs
   */
  validateStepReferences(steps, stepIds) {
    for (const step of steps) {
      if (step.depends) {
        for (let i = 0; i < step.depends.length; i++) {
          const depId = step.depends[i];
          if (!stepIds.has(depId)) {
            this.issueCollector.addIssue({
              severity: "error",
              code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
              message: `Step '${step.id}' depends on non-existent step: ${depId}`,
              location: { stepId: step.id, field: `depends[${i}]` },
              suggestion: `Choose an existing step: ${Array.from(stepIds).join(", ")}`,
              context: {
                actual: depId,
                related: Array.from(stepIds)
              }
            });
          }
        }
      }
      if (step.context?.previousOutputs) {
        for (const refStepId of step.context.previousOutputs) {
          if (!stepIds.has(refStepId)) {
            this.issueCollector.addIssue({
              severity: "error",
              code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
              message: `Step '${step.id}' references non-existent step in previousOutputs: ${refStepId}`,
              location: { stepId: step.id, field: "context.previousOutputs" },
              suggestion: `Choose an existing step: ${Array.from(stepIds).join(", ")}`,
              context: {
                actual: refStepId,
                related: Array.from(stepIds)
              }
            });
          }
        }
      }
      if (step.onFailure?.goto) {
        const targetStepId = step.onFailure.goto;
        if (!stepIds.has(targetStepId)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
            message: `Step '${step.id}' has onFailure.goto referencing non-existent step: ${targetStepId}`,
            location: { stepId: step.id, field: "onFailure.goto" },
            suggestion: `Choose an existing step: ${Array.from(stepIds).join(", ")}`,
            context: {
              actual: targetStepId,
              related: Array.from(stepIds)
            }
          });
        }
        if (step.onFailure.maxIterations !== void 0) {
          const maxIter = step.onFailure.maxIterations;
          if (typeof maxIter !== "number" || maxIter < 1) {
            this.issueCollector.addIssue({
              severity: "error",
              code: "INVALID_VALUE" /* INVALID_VALUE */,
              message: `Step '${step.id}' has invalid onFailure.maxIterations: ${maxIter}`,
              location: { stepId: step.id, field: "onFailure.maxIterations" },
              suggestion: "maxIterations must be a positive integer (default: 3)",
              context: {
                actual: maxIter,
                expected: "positive integer"
              }
            });
          }
        }
        if (step.onFailure.resetOnSuccess !== void 0) {
          if (typeof step.onFailure.resetOnSuccess !== "boolean") {
            this.issueCollector.addIssue({
              severity: "error",
              code: "INVALID_TYPE" /* INVALID_TYPE */,
              message: `Step '${step.id}' has invalid onFailure.resetOnSuccess type`,
              location: { stepId: step.id, field: "onFailure.resetOnSuccess" },
              suggestion: "resetOnSuccess must be a boolean (true or false)",
              context: {
                actual: typeof step.onFailure.resetOnSuccess,
                expected: "boolean"
              }
            });
          }
        }
      }
      if (step.skipOnLoop !== void 0 && typeof step.skipOnLoop !== "boolean") {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_TYPE" /* INVALID_TYPE */,
          message: `Step '${step.id}' has invalid skipOnLoop type`,
          location: { stepId: step.id, field: "skipOnLoop" },
          suggestion: "skipOnLoop must be a boolean (true or false)",
          context: {
            actual: typeof step.skipOnLoop,
            expected: "boolean"
          }
        });
      }
      if (step.type === "model" && step.session?.continue) {
        const contId = step.session.continue;
        if (!stepIds.has(contId)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
            message: `Step '${step.id}' has session.continue referencing non-existent step: ${contId}`,
            location: { stepId: step.id, field: "session.continue" },
            suggestion: `Choose an existing step: ${Array.from(stepIds).join(", ")}`,
            context: { actual: contId, related: Array.from(stepIds) }
          });
        } else {
          const contStep = steps.find((s) => s.id === contId);
          if (contStep && contStep.type !== "model") {
            this.issueCollector.addIssue({
              severity: "error",
              code: "INVALID_VALUE" /* INVALID_VALUE */,
              message: `Step '${step.id}' has session.continue pointing to '${contId}' which is not a model step`,
              location: { stepId: step.id, field: "session.continue" },
              suggestion: "session.continue must reference a model step",
              context: { actual: contStep.type, expected: "model" }
            });
          }
        }
      }
    }
  }
  /**
   * Validate subflow references and configuration
   *
   * This validates:
   * - Circular subflow dependencies (via GraphValidator)
   * - Flow existence in registry
   * - Input mappings match target flow inputs
   * - workspaceStrategy is valid
   * - allowRecursion flag is used correctly
   *
   * @param step - SubFlow step to validate
   * @param currentFlowId - ID of the flow containing this step
   * @param stepIds - Set of valid step IDs (for context)
   */
  validateSubFlowReferences(step, currentFlowId, stepIds) {
    const isCircular = this.graphValidator.validateSubFlowCircularity(step, currentFlowId);
    if (isCircular) {
      return;
    }
    if (this.flowRegistry && step.flowId !== currentFlowId) {
      if (!this.flowRegistry.hasFlow(step.flowId)) {
        const availableFlows = this.flowRegistry.getFlowIds();
        this.issueCollector.addIssue({
          severity: "error",
          code: "UNDEFINED_FLOW" /* UNDEFINED_FLOW */,
          message: `SubFlow step '${step.id}' references non-existent flow '${step.flowId}'`,
          location: { stepId: step.id, field: "flowId" },
          suggestion: availableFlows.length > 0 ? `Available flows: ${availableFlows.join(", ")}` : "No flows are currently registered",
          context: {
            actual: step.flowId,
            related: availableFlows
          }
        });
        return;
      }
      const referencedFlow = this.flowRegistry.getFlow(step.flowId);
      if (referencedFlow && referencedFlow.inputs) {
        const providedInputs = Object.keys(step.inputs || {});
        const requiredInputs = Object.keys(referencedFlow.inputs);
        for (const inputKey of requiredInputs) {
          if (!providedInputs.includes(inputKey)) {
            this.issueCollector.addIssue({
              severity: "warning",
              code: "MISSING_FIELD" /* MISSING_FIELD */,
              message: `SubFlow step '${step.id}' missing required input '${inputKey}' for flow '${step.flowId}'`,
              location: { stepId: step.id, field: "inputs" },
              suggestion: `Add input mapping: inputs.${inputKey}`,
              context: {
                expected: requiredInputs,
                actual: providedInputs
              }
            });
          }
        }
      }
    }
    if (step.workspaceStrategy !== void 0) {
      const validStrategies = ["inherit", "separate"];
      if (!validStrategies.includes(step.workspaceStrategy)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "INVALID_VALUE" /* INVALID_VALUE */,
          message: `SubFlow step '${step.id}' has invalid workspaceStrategy: ${step.workspaceStrategy}`,
          location: { stepId: step.id, field: "workspaceStrategy" },
          suggestion: `Must be one of: ${validStrategies.join(", ")}`,
          context: {
            actual: step.workspaceStrategy,
            expected: validStrategies,
            related: validStrategies
          }
        });
      }
    }
    if (step.inputs !== void 0 && typeof step.inputs !== "object") {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TYPE" /* INVALID_TYPE */,
        message: `SubFlow step '${step.id}' inputs must be an object`,
        location: { stepId: step.id, field: "inputs" },
        context: {
          expected: "object",
          actual: typeof step.inputs
        }
      });
    }
    if (step.allowRecursion === true && step.flowId !== currentFlowId) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_VALUE" /* INVALID_VALUE */,
        message: `SubFlow step '${step.id}' has allowRecursion=true but does not call itself (flowId='${step.flowId}')`,
        location: { stepId: step.id, field: "allowRecursion" },
        suggestion: "Remove the unnecessary allowRecursion flag or fix the flowId if recursion was intended"
      });
    }
  }
};

// ../flow-engine/src/validation/SimulationValidator.ts
var SimulationValidator = class _SimulationValidator {
  /**
   * Create a new SimulationValidator
   * @param issueCollector - Collector for validation issues
   */
  constructor(issueCollector) {
    this.issueCollector = issueCollector;
  }
  /**
   * Validate flow through simulation
   * @param flow - Flow definition to validate
   * @param stepIds - Set of valid step IDs
   */
  validateSimulation(flow, _stepIds) {
    this.analyzeDependencyChains(flow);
    this.analyzeExecutionPaths(flow);
    this.detectDeadEndOutputs(flow);
    this.simulateTemplateRendering(flow);
  }
  /**
   * Analyze dependency chains to find data flow issues
   */
  analyzeDependencyChains(flow) {
    const stepMap = /* @__PURE__ */ new Map();
    for (const step of flow.steps) {
      stepMap.set(step.id, step);
    }
    for (const step of flow.steps) {
      if (step.depends && step.depends.length > 0) {
        this.traceDependencyChain(step, stepMap, /* @__PURE__ */ new Set(), flow.id);
      }
    }
  }
  /**
   * Trace dependency chain for a step
   */
  traceDependencyChain(step, stepMap, visited, flowId, depth = 0) {
    if (depth > 10) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "UNREACHABLE_STEP" /* UNREACHABLE_STEP */,
        message: `Step '${step.id}' has very deep dependency chain (${depth} levels)`,
        location: {
          stepId: step.id,
          field: "depends",
          path: `${flowId}.steps[${step.id}].depends`
        },
        suggestion: `Consider simplifying the dependency chain or breaking into subflows`,
        context: {
          actual: depth,
          expected: "< 10 levels"
        }
      });
      return;
    }
    if (visited.has(step.id)) {
      return;
    }
    visited.add(step.id);
    if (step.depends) {
      for (const depId of step.depends) {
        const depStep = stepMap.get(depId);
        if (depStep && depStep.depends) {
          this.traceDependencyChain(depStep, stepMap, visited, flowId, depth + 1);
        }
      }
    }
  }
  /**
   * Analyze execution paths through the flow
   */
  analyzeExecutionPaths(flow) {
    const rootSteps = flow.steps.filter((step) => !step.depends || step.depends.length === 0);
    if (rootSteps.length === 0) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "UNREACHABLE_STEP" /* UNREACHABLE_STEP */,
        message: `Flow has no root steps (all steps have dependencies)`,
        location: {
          path: `${flow.id}.steps`
        },
        suggestion: `Ensure at least one step has no dependencies`
      });
      return;
    }
    const dependents = this.buildDependentsMap(flow.steps);
    const terminalSteps = flow.steps.filter((step) => {
      const deps = dependents.get(step.id) || /* @__PURE__ */ new Set();
      return deps.size === 0 && !step.when;
    });
    if (terminalSteps.length === 0) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "NO_TERMINAL_STEP" /* NO_TERMINAL_STEP */,
        message: `Flow has no guaranteed terminal steps (all steps are conditional or have dependents)`,
        location: {
          path: `${flow.id}.steps`
        },
        suggestion: `Ensure at least one execution path reaches a terminal step`
      });
    }
    const paths = this.simulateExecutionPaths(flow);
    const pathsWithoutTerminal = paths.filter((p) => !p.reachesTerminal);
    if (pathsWithoutTerminal.length > 0) {
      this.issueCollector.addIssue({
        severity: "warning",
        code: "NO_TERMINAL_STEP" /* NO_TERMINAL_STEP */,
        message: `Some execution paths may not reach terminal steps`,
        location: {
          path: `${flow.id}.steps`
        },
        suggestion: `Review conditional logic to ensure all paths complete`,
        context: {
          actual: `${pathsWithoutTerminal.length} incomplete paths`
        }
      });
    }
  }
  /**
   * Build map of dependents (reverse dependencies)
   */
  buildDependentsMap(steps) {
    const dependents = /* @__PURE__ */ new Map();
    for (const step of steps) {
      if (step.depends) {
        for (const depId of step.depends) {
          if (!dependents.has(depId)) {
            dependents.set(depId, /* @__PURE__ */ new Set());
          }
          dependents.get(depId).add(step.id);
        }
      }
    }
    return dependents;
  }
  /**
   * Simulate execution paths through the flow
   */
  simulateExecutionPaths(flow) {
    const paths = [];
    const stepMap = /* @__PURE__ */ new Map();
    for (const step of flow.steps) {
      stepMap.set(step.id, step);
    }
    const rootSteps = flow.steps.filter((step) => !step.depends || step.depends.length === 0);
    for (const root of rootSteps) {
      const path10 = {
        steps: [root.id],
        reachesTerminal: !root.when,
        // Conditional roots may not execute
        producedOutputs: /* @__PURE__ */ new Map()
      };
      if (root.output) {
        path10.producedOutputs.set(root.id, new Set(Object.keys(root.output)));
      }
      paths.push(path10);
    }
    return paths;
  }
  /**
   * Detect outputs that are produced but never used
   */
  detectDeadEndOutputs(flow) {
    const producedOutputs = /* @__PURE__ */ new Map();
    for (const step of flow.steps) {
      if (step.output) {
        producedOutputs.set(step.id, new Set(Object.keys(step.output)));
      }
    }
    const usedOutputs = /* @__PURE__ */ new Map();
    for (const step of flow.steps) {
      const text = this.getStepText(step);
      const stepRefPattern = /steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)/g;
      const matches = [...text.matchAll(stepRefPattern)];
      for (const match of matches) {
        const referencedStepId = match[1];
        const referencedOutput = match[2];
        if (!usedOutputs.has(referencedStepId)) {
          usedOutputs.set(referencedStepId, /* @__PURE__ */ new Set());
        }
        usedOutputs.get(referencedStepId).add(referencedOutput);
      }
    }
    for (const [stepId, outputs] of producedOutputs) {
      const used = usedOutputs.get(stepId) || /* @__PURE__ */ new Set();
      for (const outputName of outputs) {
        if (!used.has(outputName)) {
          this.issueCollector.addIssue({
            severity: "info",
            code: "UNUSED_OUTPUT" /* UNUSED_OUTPUT */,
            message: `Output '${outputName}' from step '${stepId}' is never used`,
            location: {
              stepId,
              field: `output.${outputName}`,
              path: `${flow.id}.steps[${stepId}].output.${outputName}`
            },
            suggestion: `Remove unused output or use it in a subsequent step`
          });
        }
      }
    }
  }
  /**
   * Get searchable text from a step
   */
  getStepText(step) {
    let text = "";
    if (step.type === "model") {
      text += step.prompt;
    } else if (step.type === "script") {
      text += step.script;
    } else if (step.type === "subflow") {
      text += JSON.stringify(step.inputs);
    }
    if (step.onFailure?.addComment) {
      text += step.onFailure.addComment;
    }
    return text;
  }
  /**
   * Whitelist regex for valid template expressions.
   * Valid forms:
   *   inputs.<id>
   *   steps.<id>.outputs.<id>
   *   flow.<id>
   *   task.<id>  (prompt template only — task is NOT available in when: conditions)
   * Where <id> is [a-zA-Z0-9_-]+
   */
  static VALID_TEMPLATE_EXPRESSION = /^(inputs\.[a-zA-Z0-9_-]+|steps\.[a-zA-Z0-9_-]+\.outputs\.[a-zA-Z0-9_.-]+|steps\.[a-zA-Z0-9_-]+\.meta\.[a-zA-Z0-9_.-]+|flow\.[a-zA-Z0-9_-]+|task\.[a-zA-Z0-9_-]+|context\.[a-zA-Z0-9_-]+)$/;
  /**
   * Validate a single template expression against the whitelist.
   * Adds an INVALID_TEMPLATE_SYNTAX error if it does not match.
   * Adds an UNDECLARED_OUTPUT_KEY error if the referenced output key is not declared
   * on the source step (only when the source step has an explicit `output:` config).
   */
  validateTemplateExpression(expression, step, flow) {
    if (!_SimulationValidator.VALID_TEMPLATE_EXPRESSION.test(expression)) {
      this.issueCollector.addIssue({
        severity: "error",
        code: "INVALID_TEMPLATE_SYNTAX" /* INVALID_TEMPLATE_SYNTAX */,
        message: `Invalid template expression: \${{ ${expression} }}`,
        location: {
          stepId: step.id,
          field: step.type === "model" ? "prompt" : "script",
          path: `${flow.id}.steps[${step.id}]`
        },
        suggestion: `Valid forms: \${{ inputs.name }}, \${{ steps.step-id.outputs.varName }}, \${{ steps.step-id.meta.session_id }}, \${{ flow.allLogs }}, \${{ task.priority }}, \${{ context.cwd }}`,
        context: {
          actual: expression,
          expected: "inputs.<id> | steps.<id>.outputs.<id> | steps.<id>.meta.<field> | flow.<id> | task.<id> | context.<id>"
        }
      });
      return;
    }
    const stepsRef = /^steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)$/.exec(expression);
    if (stepsRef) {
      const sourceStepId = stepsRef[1];
      const outputKey = stepsRef[2];
      const sourceStep = flow.steps.find((s) => s.id === sourceStepId);
      if (sourceStep?.output && Object.keys(sourceStep.output).length > 0) {
        if (!(outputKey in sourceStep.output)) {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDECLARED_OUTPUT_KEY" /* UNDECLARED_OUTPUT_KEY */,
            message: `Step '${sourceStepId}' has no declared output '${outputKey}' (declared: ${Object.keys(sourceStep.output).join(", ")})`,
            location: {
              stepId: step.id,
              field: step.type === "model" ? "prompt" : "script",
              path: `${flow.id}.steps[${step.id}]`
            },
            suggestion: `Use one of the declared outputs: ${Object.keys(sourceStep.output).join(", ")}`,
            context: {
              actual: outputKey,
              expected: Object.keys(sourceStep.output).join(" | ")
            }
          });
        }
      }
    }
  }
  /**
   * Simulate template rendering to find issues
   */
  simulateTemplateRendering(flow) {
    for (const step of flow.steps) {
      const text = this.getStepText(step);
      const templateRegex = /\$\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = templateRegex.exec(text)) !== null) {
        const expression = match[1].trim();
        this.validateTemplateExpression(expression, step, flow);
      }
    }
  }
};

// ../flow-engine/src/validation/TemplateValidator.ts
var TemplateValidator = class {
  /**
   * Create a new TemplateValidator
   * @param issueCollector - Collector for validation issues
   * @param enableAutoDiscovery - Whether to auto-discover undeclared inputs (default: true)
   */
  constructor(issueCollector, enableAutoDiscovery = true) {
    this.issueCollector = issueCollector;
    this.enableAutoDiscovery = enableAutoDiscovery;
  }
  autoDiscoveredInputs = /* @__PURE__ */ new Map();
  enableAutoDiscovery;
  /**
   * Get auto-discovered inputs
   * @returns Map of input names to normalized definitions
   */
  getAutoDiscoveredInputs() {
    return this.autoDiscoveredInputs;
  }
  /**
   * Validate all template variables in the flow
   *
   * @param flow - Flow definition to validate
   * @param stepIds - Set of valid step IDs (from SchemaValidator)
   * @param inputNames - Set of valid input names (from SchemaValidator)
   */
  validateTemplates(flow, stepIds, inputNames) {
    this.autoDiscoveredInputs = /* @__PURE__ */ new Map();
    const references = this.extractVariableReferences(flow);
    for (const ref of references) {
      this.validateReference(ref, flow, stepIds, inputNames);
    }
  }
  /**
   * Extract all variable references from templates
   *
   * Scans all steps for ${{ ... }} template expressions and parses them
   * into structured variable references.
   *
   * @param flow - Flow definition to scan
   * @returns Array of variable references found
   */
  extractVariableReferences(flow) {
    const references = [];
    const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;
    for (const step of flow.steps) {
      let text = "";
      let fieldName = "";
      if (step.type === "model") {
        text = step.prompt || "";
        fieldName = "prompt";
      } else if (step.type === "script") {
        text = step.script || "";
        fieldName = "script";
      } else if (step.type === "subflow") {
        for (const [inputKey, inputValue] of Object.entries(step.inputs || {})) {
          if (typeof inputValue === "string") {
            let match;
            const regex = new RegExp(templateRegex.source, templateRegex.flags);
            while ((match = regex.exec(inputValue)) !== null) {
              const expression = match[1].trim();
              const parsed = this.parseVariableExpression(expression);
              if (parsed) {
                references.push({
                  expression,
                  type: parsed.type,
                  path: parsed.path,
                  location: {
                    stepId: step.id,
                    field: `inputs.${inputKey}`
                  }
                });
              }
            }
          }
        }
        continue;
      }
      if (text) {
        let match;
        while ((match = templateRegex.exec(text)) !== null) {
          const expression = match[1].trim();
          const parsed = this.parseVariableExpression(expression);
          if (parsed) {
            references.push({
              expression,
              type: parsed.type,
              path: parsed.path,
              location: {
                stepId: step.id,
                field: fieldName
              }
            });
          }
        }
      }
    }
    return references;
  }
  /**
   * Parse a variable expression into its components
   *
   * Examples:
   * - "inputs.foo" → { type: 'input', path: ['foo'] }
   * - "steps.bar.outputs.baz" → { type: 'step', path: ['bar', 'outputs', 'baz'] }
   * - "task.priority" → { type: 'task', path: ['priority'] }
   *
   * @param expression - Variable expression to parse
   * @returns Parsed expression or null if invalid format
   */
  parseVariableExpression(expression) {
    const parts = expression.split(".");
    if (parts[0] === "inputs") {
      return { type: "input", path: parts.slice(1) };
    } else if (parts[0] === "steps") {
      return { type: "step", path: parts.slice(1) };
    } else if (parts[0] === "task") {
      return { type: "task", path: parts.slice(1) };
    }
    return null;
  }
  /**
   * Validate a single variable reference
   *
   * @param ref - Variable reference to validate
   * @param flow - Flow definition for looking up step configurations
   * @param stepIds - Set of valid step IDs
   * @param inputNames - Set of valid input names
   */
  validateReference(ref, flow, stepIds, inputNames) {
    if (ref.type === "input") {
      const inputName = ref.path[0];
      if (!inputNames.has(inputName)) {
        if (this.enableAutoDiscovery) {
          if (!this.autoDiscoveredInputs.has(inputName)) {
            this.autoDiscoveredInputs.set(inputName, {
              type: "string",
              required: false,
              source: "auto-discovered"
            });
            this.issueCollector.addIssue({
              severity: "info",
              code: "AUTO_DISCOVERED_INPUT" /* AUTO_DISCOVERED_INPUT */,
              message: `Auto-discovered input '${inputName}' from template reference: ${ref.expression}`,
              location: ref.location,
              suggestion: `Consider explicitly declaring this input in the flow definition for better documentation`,
              context: {
                actual: inputName,
                related: Array.from(inputNames)
              }
            });
          }
        } else {
          this.issueCollector.addIssue({
            severity: "error",
            code: "UNDEFINED_INPUT" /* UNDEFINED_INPUT */,
            message: `Reference to undefined input: ${ref.expression}`,
            location: ref.location,
            suggestion: `Define input '${inputName}' or use an existing one: ${Array.from(inputNames).join(", ")}`,
            context: {
              actual: inputName,
              related: Array.from(inputNames)
            }
          });
        }
      }
    } else if (ref.type === "step") {
      const stepId = ref.path[0];
      if (!stepIds.has(stepId)) {
        this.issueCollector.addIssue({
          severity: "error",
          code: "UNDEFINED_STEP" /* UNDEFINED_STEP */,
          message: `Reference to undefined step: ${ref.expression}`,
          location: ref.location,
          suggestion: `Use an existing step: ${Array.from(stepIds).join(", ")}`,
          context: {
            actual: stepId,
            related: Array.from(stepIds)
          }
        });
      } else if (ref.path.length >= 3 && ref.path[1] === "outputs") {
        const outputVarName = ref.path[2];
        const sourceStep = flow.steps.find((s) => s.id === stepId);
        if (sourceStep && sourceStep.output) {
          if (!sourceStep.output[outputVarName]) {
            const availableOutputs = Object.keys(sourceStep.output);
            this.issueCollector.addIssue({
              severity: "warning",
              code: "UNDEFINED_OUTPUT" /* UNDEFINED_OUTPUT */,
              message: `Reference to undefined output: ${ref.expression}. Step '${stepId}' does not define output '${outputVarName}'`,
              location: ref.location,
              suggestion: availableOutputs.length > 0 ? `Add output definition to step '${stepId}' or use an existing output: ${availableOutputs.join(", ")}` : `Add output definition for '${outputVarName}' to step '${stepId}'`,
              context: {
                actual: outputVarName,
                related: availableOutputs
              }
            });
          }
        } else if (sourceStep && !sourceStep.output) {
          this.issueCollector.addIssue({
            severity: "warning",
            code: "MISSING_OUTPUT" /* MISSING_OUTPUT */,
            message: `Reference to output from step with no output config: ${ref.expression}`,
            location: ref.location,
            suggestion: `Add 'output' configuration to step '${stepId}' to define available outputs`
          });
        }
      }
    } else if (ref.type === "task") {
      const validTaskFields = ["priority", "metadata", "id", "createdAt"];
      const field = ref.path[0];
      if (!validTaskFields.includes(field) && field !== "metadata") {
        this.issueCollector.addIssue({
          severity: "warning",
          code: "UNDEFINED_VARIABLE" /* UNDEFINED_VARIABLE */,
          message: `Possible undefined task field: ${ref.expression}`,
          location: ref.location,
          suggestion: `Common task fields: ${validTaskFields.join(", ")}`,
          context: {
            actual: field,
            related: validTaskFields
          }
        });
      }
    }
  }
};

// ../flow-engine/src/validation/FlowValidator.ts
var FlowValidator = class {
  issues = [];
  flowRegistry;
  // Specialized validators
  schemaValidator;
  graphValidator;
  semanticValidator;
  templateValidator;
  dependencyOrderValidator;
  logicalValidator;
  contractValidator;
  simulationValidator;
  /**
   * Create a new FlowValidator
   * @param flowRegistry - Optional FlowRegistry for subflow validation
   * @param validTaskStatuses - Valid task status values for statusTransitions validation; if empty, values are not validated
   */
  constructor(flowRegistry, validTaskStatuses = []) {
    this.flowRegistry = flowRegistry;
    this.schemaValidator = new SchemaValidator(this, validTaskStatuses);
    this.graphValidator = new GraphValidator(this, flowRegistry);
    this.semanticValidator = new SemanticValidator(this, this.graphValidator, flowRegistry);
    this.templateValidator = new TemplateValidator(this);
    this.dependencyOrderValidator = new DependencyOrderValidator(this);
    this.logicalValidator = new LogicalValidator(this);
    this.contractValidator = new ContractValidator(this);
    this.simulationValidator = new SimulationValidator(this);
  }
  /**
   * Validate a flow definition completely
   * Orchestrates the eight specialized validators in sequence
   */
  validate(flow) {
    this.issues = [];
    const { stepIds, normalizedInputs } = this.schemaValidator.validateSchema(flow);
    if (!this.canProceedToSemantics()) {
      return this.buildResult();
    }
    this.graphValidator.validateGraph(flow.steps);
    this.semanticValidator.validateSemantics(flow, stepIds);
    const inputNames = new Set(Object.keys(normalizedInputs));
    this.templateValidator.validateTemplates(flow, stepIds, inputNames);
    const autoDiscoveredInputs = this.templateValidator.getAutoDiscoveredInputs();
    const mergedInputs = { ...normalizedInputs };
    for (const [inputName, inputDef] of autoDiscoveredInputs) {
      if (!mergedInputs[inputName]) {
        mergedInputs[inputName] = inputDef;
      }
    }
    flow._autoDiscoveredInputs = mergedInputs;
    this.dependencyOrderValidator.validateDependencyOrder(flow);
    this.logicalValidator.validateLogical(flow, stepIds);
    this.contractValidator.validateContracts(flow, stepIds);
    if (this.canProceedToSimulation()) {
      this.simulationValidator.validateSimulation(flow, stepIds);
    }
    return this.buildResult();
  }
  /**
   * Add a validation issue (IssueCollector interface)
   * Called by specialized validators to report issues
   */
  addIssue(issue) {
    this.issues.push(issue);
  }
  /**
   * Check if we can proceed to semantic validation
   * (basic structure must be valid)
   */
  canProceedToSemantics() {
    const criticalErrors = this.issues.filter(
      (issue) => issue.severity === "error" && (issue.code === "MISSING_FIELD" /* MISSING_FIELD */ || issue.code === "EMPTY_COLLECTION" /* EMPTY_COLLECTION */)
    );
    return criticalErrors.length === 0;
  }
  /**
   * Check if we can proceed to simulation validation
   * (no structural or semantic errors)
   */
  canProceedToSimulation() {
    const errors = this.issues.filter((issue) => issue.severity === "error");
    return errors.length === 0;
  }
  /**
   * Build the final validation result
   */
  buildResult() {
    const summary = {
      errors: this.issues.filter((i) => i.severity === "error").length,
      warnings: this.issues.filter((i) => i.severity === "warning").length,
      info: this.issues.filter((i) => i.severity === "info").length
    };
    return {
      valid: summary.errors === 0,
      issues: this.issues,
      summary
    };
  }
};

// ../../node_modules/uuid/dist/esm-node/rng.js
var import_crypto = __toESM(require("crypto"));
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    import_crypto.default.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// ../../node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// ../../node_modules/uuid/dist/esm-node/native.js
var import_crypto2 = __toESM(require("crypto"));
var native_default = {
  randomUUID: import_crypto2.default.randomUUID
};

// ../../node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// ../flow-engine/src/processing/ConditionEvaluator.ts
var ConditionEvaluationError = class extends Error {
  constructor(message, condition, stepId) {
    super(`Condition evaluation error in step '${stepId}': ${message}`);
    this.condition = condition;
    this.stepId = stepId;
    this.name = "ConditionEvaluationError";
  }
};

// ../flow-engine/src/orchestration/FlowScheduler.ts
var FlowScheduler = class _FlowScheduler {
  constructor(context) {
    this.context = context;
  }
  steps = /* @__PURE__ */ new Map();
  /** Original dep set per step — used when rebuilding after loop invalidation */
  originalDeps = /* @__PURE__ */ new Map();
  /** stepId → set of stepIds that depend on it */
  reverseDeps = /* @__PURE__ */ new Map();
  /** Remaining unmet deps per step. Entry removed when step is dispatched (all deps met). */
  pendingDeps = /* @__PURE__ */ new Map();
  completedSteps = /* @__PURE__ */ new Set();
  failedSteps = /* @__PURE__ */ new Set();
  /** Steps that have been acknowledged (dispatched) but not yet completed. */
  inFlightSteps = /* @__PURE__ */ new Set();
  retryCount = /* @__PURE__ */ new Map();
  loopIterations = /* @__PURE__ */ new Map();
  outputs = /* @__PURE__ */ new Map();
  started = false;
  /**
   * Load all steps. Returns initially ready items.
   * Call sequence: start() → acknowledge(stepId) → dispatch → complete(stepId, outcome)
   */
  start(steps, depends) {
    this.started = true;
    for (const step of steps) {
      this.steps.set(step.id, step);
      const deps = depends.get(step.id) ?? [];
      this.originalDeps.set(step.id, new Set(deps));
      this.pendingDeps.set(step.id, new Set(deps));
      for (const dep of deps) {
        if (!this.reverseDeps.has(dep)) this.reverseDeps.set(dep, /* @__PURE__ */ new Set());
        this.reverseDeps.get(dep).add(step.id);
      }
    }
    return this.collectReady();
  }
  /**
   * Mark a step as dispatched (in-flight). Prevents duplicate dispatch
   * if the consumer iterates ready items concurrently. Call immediately after dispatching.
   */
  acknowledge(stepId) {
    this.inFlightSteps.add(stepId);
  }
  /**
   * Mark a step as finished. Returns newly ready items.
   * Handles retry: if outcome is 'failed' and retry config allows, re-enqueues the step.
   * If a loop (onFailure.goto) triggers, invalidates target and descendants and re-enqueues them.
   * Returns [] if the step was invalidated by a loop before this call arrived (stale result).
   */
  complete(stepId, outcome) {
    if (this.pendingDeps.has(stepId)) {
      this.inFlightSteps.delete(stepId);
      return [];
    }
    this.inFlightSteps.delete(stepId);
    if (outcome.type === "completed") {
      this.outputs.set(stepId, outcome.outputs);
      this.context.stepOutputs.set(stepId, outcome.outputs);
      this.completedSteps.add(stepId);
      this.propagateCompletion(stepId);
      this.handleLoopResetOnSuccess(stepId);
      return this.collectReady();
    }
    const step = this.steps.get(stepId);
    if (!step) throw new Error(`FlowScheduler: unknown stepId "${stepId}" in complete()`);
    const retry = step.retry;
    if (retry) {
      const attempts = (this.retryCount.get(stepId) ?? 0) + 1;
      if (attempts <= retry.maxAttempts) {
        this.retryCount.set(stepId, attempts);
        this.pendingDeps.set(stepId, /* @__PURE__ */ new Set());
        return this.collectReady();
      }
    }
    const onFailure = step.onFailure;
    if (onFailure?.goto) {
      return this.handleLoop(stepId, onFailure);
    }
    this.failedSteps.add(stepId);
    return [];
  }
  /**
   * Reverse of acknowledge(). Called when transport dispatch failed — the step was never sent.
   * Consumer is responsible for re-queuing it externally. FlowScheduler removes it from in-flight.
   */
  unacknowledge(stepId) {
    this.inFlightSteps.delete(stepId);
  }
  /** Total number of steps registered (including injected). */
  getStepCount() {
    return this.steps.size;
  }
  /** All step IDs currently registered (initial + injected). */
  getStepIds() {
    return new Set(this.steps.keys());
  }
  /** Inject steps dynamically (MCP provideSteps). Returns newly ready items. */
  inject(steps) {
    for (const step of steps) {
      this.steps.set(step.id, step);
      const deps = step.depends ?? [];
      this.originalDeps.set(step.id, new Set(deps));
      const remaining = new Set(deps.filter((d) => !this.completedSteps.has(d)));
      this.pendingDeps.set(step.id, remaining);
      for (const dep of deps) {
        if (!this.reverseDeps.has(dep)) this.reverseDeps.set(dep, /* @__PURE__ */ new Set());
        this.reverseDeps.get(dep).add(step.id);
      }
    }
    return this.collectReady();
  }
  /** True when no steps remain pending (all completed, skipped, or failed-terminal). Returns false before start() is called. */
  isTerminal() {
    if (!this.started) return false;
    if (this.hasFailed()) return true;
    return this.completedSteps.size === this.steps.size && this.inFlightSteps.size === 0 && this.pendingDeps.size === 0;
  }
  /** True when any step failed with no retry or loop remaining. */
  hasFailed() {
    return this.failedSteps.size > 0;
  }
  /** Current step outputs map (read-only snapshot). Used by CommandHandler to sync ExecutionContext. */
  getOutputs() {
    return new Map(this.outputs);
  }
  collectReady() {
    const ready = [];
    const skipped = [];
    for (const [stepId, deps] of this.pendingDeps) {
      if (deps.size === 0 && !this.inFlightSteps.has(stepId)) {
        const step = this.steps.get(stepId);
        if (!step) throw new Error(`FlowScheduler: unknown stepId "${stepId}" in collectReady()`);
        this.pendingDeps.delete(stepId);
        if (step.when !== void 0) {
          const shouldRun = this.evaluateWhen(step, stepId);
          if (!shouldRun) {
            this.completedSteps.add(stepId);
            skipped.push(stepId);
            continue;
          }
        }
        ready.push({ stepId, step });
      }
    }
    if (skipped.length > 0) {
      for (const skippedId of skipped) {
        for (const deps of this.pendingDeps.values()) {
          deps.delete(skippedId);
        }
      }
      ready.push(...this.collectReady());
    }
    return ready;
  }
  /**
   * Evaluate a step's when: condition.
   *
   * Context exposed to the expression:
   *   outputs  — step outputs keyed by dep step id: { 'dep-id': { field: value } }
   *   inputs   — flow-level inputs
   *   steps    — same data in GitHub Actions shape: { 'dep-id': { outputs: { field: value } } }
   *              (available in both bare and ${{ }} forms)
   *
   * Dot-notation for hyphenated IDs is supported transparently:
   *   `outputs.get-status.field` → converted to `outputs['get-status'].field`
   *   `steps.get-status.outputs.field` → converted to `steps['get-status'].outputs.field`
   *
   * Both bare expressions and ${{ }} wrapper are supported.
   */
  evaluateWhen(step, stepId) {
    let condition = step.when.trim();
    if (condition.startsWith("${{") && condition.endsWith("}}")) {
      condition = condition.slice(3, -2).trim();
    }
    condition = _FlowScheduler.normalizeDotNotation(condition);
    const depIds = Array.from(this.originalDeps.get(stepId) ?? []);
    const outputs = {};
    for (const depId of depIds) {
      outputs[depId] = this.outputs.get(depId) ?? {};
    }
    const steps = {};
    for (const depId of depIds) {
      steps[depId] = { outputs: this.outputs.get(depId) ?? {} };
    }
    try {
      const evalFn = new Function("outputs", "inputs", "steps", `"use strict"; return (${condition});`);
      const result = evalFn(outputs, this.context.inputs, steps);
      if (typeof result !== "boolean") {
        throw new ConditionEvaluationError(
          `Condition must evaluate to boolean, got: ${typeof result}`,
          condition,
          stepId
        );
      }
      return result;
    } catch (err) {
      if (err instanceof ConditionEvaluationError) throw err;
      throw new ConditionEvaluationError(
        `Failed to evaluate condition: ${err instanceof Error ? err.message : String(err)}`,
        condition,
        stepId
      );
    }
  }
  /**
   * Convert dot-notation path segments that are not valid JS identifiers to bracket notation.
   * Handles `outputs.get-status.field` → `outputs['get-status'].field`
   * and `steps.get-status.outputs.field` → `steps['get-status'].outputs.field`
   */
  static normalizeDotNotation(condition) {
    return condition.replace(/\.([a-zA-Z0-9_][a-zA-Z0-9_-]*-[a-zA-Z0-9_-]*)/g, "['$1']");
  }
  propagateCompletion(stepId) {
    for (const deps of this.pendingDeps.values()) {
      deps.delete(stepId);
    }
  }
  handleLoopResetOnSuccess(completedStepId) {
    for (const [stepId, step] of this.steps) {
      const onFailure = step.onFailure;
      if (onFailure?.goto === completedStepId && onFailure.resetOnSuccess) {
        this.loopIterations.delete(stepId);
      }
    }
  }
  handleLoop(failedStepId, onFailure) {
    const targetStepId = onFailure.goto;
    const maxIterations = onFailure.maxIterations ?? 3;
    const current = this.loopIterations.get(failedStepId) ?? 0;
    if (current >= maxIterations) {
      this.failedSteps.add(failedStepId);
      return [];
    }
    this.loopIterations.set(failedStepId, current + 1);
    const toInvalidate = /* @__PURE__ */ new Set([targetStepId]);
    const bfsQueue = [targetStepId];
    while (bfsQueue.length > 0) {
      const id = bfsQueue.shift();
      for (const dep of this.reverseDeps.get(id) ?? /* @__PURE__ */ new Set()) {
        if (!toInvalidate.has(dep)) {
          toInvalidate.add(dep);
          bfsQueue.push(dep);
        }
      }
    }
    for (const invId of toInvalidate) {
      const step = this.steps.get(invId);
      if (!step) throw new Error(`FlowScheduler: unknown stepId "${invId}" in handleLoop()`);
      if (step.skipOnLoop) continue;
      this.completedSteps.delete(invId);
      this.inFlightSteps.delete(invId);
      this.outputs.delete(invId);
      this.context.stepOutputs.delete(invId);
      const origDeps = this.originalDeps.get(invId) ?? /* @__PURE__ */ new Set();
      const remaining = /* @__PURE__ */ new Set();
      for (const dep of origDeps) {
        if (!this.completedSteps.has(dep)) remaining.add(dep);
      }
      this.pendingDeps.set(invId, remaining);
    }
    return this.collectReady();
  }
};

// ../flow-engine/src/processing/TemplateRenderer.ts
var TemplateRenderError = class extends Error {
  constructor(message, template, variable) {
    super(`Template render error: ${message}`);
    this.template = template;
    this.variable = variable;
    this.name = "TemplateRenderError";
  }
};
var TemplateRenderer = class {
  /**
   * Render a template string with variable interpolation
   *
   * @param template - Template string with ${{ expression }} placeholders
   * @param context - Context containing variables
   * @param strict - If true, throw error on missing variables (default: true)
   * @returns Rendered string
   */
  render(template, context, strict = true) {
    const pattern = /\$\{\{\s*([^}]+?)\s*\}\}/g;
    let result = template;
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(template)) !== null) {
      const placeholder = match[0];
      const expression = match[1].trim();
      try {
        const value = this.resolveVariable(expression, context);
        result = result.replace(placeholder, this.formatValue(value));
      } catch (error) {
        if (strict) {
          throw error;
        } else {
          console.warn(`Failed to resolve ${placeholder}:`, error);
        }
      }
    }
    return result;
  }
  /**
   * Resolve a variable expression to its value (GitHub Actions syntax)
   *
   * @param expression - Variable expression (e.g., "inputs.name", "steps.build.outputs.version", "task.priority")
   * @param context - Template context
   * @returns Resolved value
   */
  resolveVariable(expression, context) {
    const parts = expression.split(".");
    const root = parts[0];
    if (root === "inputs") {
      if (parts.length < 2) {
        throw new TemplateRenderError("inputs requires a variable name: inputs.varName", expression, root);
      }
      const path10 = parts.slice(1);
      return this.resolveNested(context.inputs, path10, expression);
    } else if (root === "steps") {
      if (parts.length < 4 || parts[2] !== "outputs" && parts[2] !== "meta") {
        throw new TemplateRenderError(
          "steps requires format: steps.stepId.outputs.varName or steps.stepId.meta.field",
          expression,
          root
        );
      }
      const stepId = parts[1];
      const namespace = parts[2];
      if (namespace === "meta") {
        const meta = context.stepMeta?.get(stepId);
        if (!meta) {
          throw new TemplateRenderError(`Step '${stepId}' not found or has no meta`, expression, stepId);
        }
        const path11 = parts.slice(3);
        return this.resolveNested(meta, path11, expression);
      }
      const stepOutputs2 = context.stepOutputs.get(stepId);
      if (!stepOutputs2) {
        throw new TemplateRenderError(`Step '${stepId}' not found or has no outputs`, expression, stepId);
      }
      const path10 = parts.slice(3);
      return this.resolveNested(stepOutputs2, path10, expression);
    } else if (root === "task") {
      if (parts.length < 2) {
        throw new TemplateRenderError("task requires a property: task.priority", expression, root);
      }
      const path10 = parts.slice(1);
      return this.resolveNested(context.taskMetadata, path10, expression);
    } else if (root === "context") {
      if (parts.length < 2) {
        throw new TemplateRenderError("context requires a property: context.cwd", expression, root);
      }
      const path10 = parts.slice(1);
      return this.resolveNested(context.context ?? {}, path10, expression);
    } else {
      throw new TemplateRenderError(
        `Unknown root context: '${root}'. Use 'inputs', 'steps', 'task', or 'context'`,
        expression,
        root
      );
    }
  }
  /**
   * Resolve nested object access (e.g., task.metadata.key)
   *
   * @param obj - Object to traverse
   * @param path - Array of keys to access
   * @param fullExpression - Full expression for error messages
   * @returns Resolved value
   */
  resolveNested(obj, path10, fullExpression) {
    let current = obj;
    for (const key of path10) {
      if (current === null || current === void 0) {
        throw new TemplateRenderError(`Cannot access '${key}' on null/undefined`, fullExpression, key);
      }
      if (typeof current !== "object") {
        throw new TemplateRenderError(`Cannot access '${key}' on non-object value`, fullExpression, key);
      }
      if (!(key in current)) {
        throw new TemplateRenderError(`Property '${key}' not found`, fullExpression, key);
      }
      current = current[key];
    }
    return current;
  }
  /**
   * Format a value for string interpolation
   *
   * @param value - Value to format
   * @returns String representation
   */
  formatValue(value) {
    if (value === null) {
      return "null";
    }
    if (value === void 0) {
      return "undefined";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
  /**
   * Check if a template contains any variables
   *
   * @param template - Template string to check
   * @returns True if template has variables
   */
  hasVariables(template) {
    return /\$\{\{[^}]+\}\}/.test(template);
  }
  /**
   * Extract all variable names from a template
   *
   * @param template - Template string
   * @returns Array of variable expressions found
   */
  extractVariables(template) {
    const pattern = /\$\{\{\s*([^}]+?)\s*\}\}/g;
    const variables = [];
    let match;
    while ((match = pattern.exec(template)) !== null) {
      variables.push(match[1].trim());
    }
    return variables;
  }
};

// ../flow-engine/src/workspace/WorkspaceManager.ts
var fs2 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);

// ../flow-engine/src/workspace/WorkspaceGitStrategy.ts
var path = __toESM(require("path"), 1);

// ../../node_modules/simple-git/dist/esm/index.js
var import_node_buffer = require("node:buffer");
var import_file_exists = __toESM(require_dist(), 1);
var import_debug = __toESM(require_src(), 1);
var import_child_process = require("child_process");
var import_promise_deferred = __toESM(require_dist2(), 1);
var import_node_path = require("node:path");
var import_promise_deferred2 = __toESM(require_dist2(), 1);
var import_node_events = require("node:events");
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
};
var __commonJS2 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var __copyProps2 = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames2(from))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
function pathspec(...paths) {
  const key = new String(paths);
  cache.set(key, paths);
  return key;
}
function isPathSpec(path10) {
  return path10 instanceof String && cache.has(path10);
}
function toPaths(pathSpec) {
  return cache.get(pathSpec) || [];
}
var cache;
var init_pathspec = __esm({
  "src/lib/args/pathspec.ts"() {
    "use strict";
    cache = /* @__PURE__ */ new WeakMap();
  }
});
var GitError;
var init_git_error = __esm({
  "src/lib/errors/git-error.ts"() {
    "use strict";
    GitError = class extends Error {
      constructor(task, message) {
        super(message);
        this.task = task;
        Object.setPrototypeOf(this, new.target.prototype);
      }
    };
  }
});
var GitResponseError;
var init_git_response_error = __esm({
  "src/lib/errors/git-response-error.ts"() {
    "use strict";
    init_git_error();
    GitResponseError = class extends GitError {
      constructor(git, message) {
        super(void 0, message || String(git));
        this.git = git;
      }
    };
  }
});
var TaskConfigurationError;
var init_task_configuration_error = __esm({
  "src/lib/errors/task-configuration-error.ts"() {
    "use strict";
    init_git_error();
    TaskConfigurationError = class extends GitError {
      constructor(message) {
        super(void 0, message);
      }
    };
  }
});
function asFunction(source) {
  if (typeof source !== "function") {
    return NOOP;
  }
  return source;
}
function isUserFunction(source) {
  return typeof source === "function" && source !== NOOP;
}
function splitOn(input, char) {
  const index = input.indexOf(char);
  if (index <= 0) {
    return [input, ""];
  }
  return [input.substr(0, index), input.substr(index + 1)];
}
function first(input, offset = 0) {
  return isArrayLike(input) && input.length > offset ? input[offset] : void 0;
}
function last(input, offset = 0) {
  if (isArrayLike(input) && input.length > offset) {
    return input[input.length - 1 - offset];
  }
}
function isArrayLike(input) {
  return filterHasLength(input);
}
function toLinesWithContent(input = "", trimmed2 = true, separator = "\n") {
  return input.split(separator).reduce((output, line) => {
    const lineContent = trimmed2 ? line.trim() : line;
    if (lineContent) {
      output.push(lineContent);
    }
    return output;
  }, []);
}
function forEachLineWithContent(input, callback) {
  return toLinesWithContent(input, true).map((line) => callback(line));
}
function folderExists(path10) {
  return (0, import_file_exists.exists)(path10, import_file_exists.FOLDER);
}
function append(target, item) {
  if (Array.isArray(target)) {
    if (!target.includes(item)) {
      target.push(item);
    }
  } else {
    target.add(item);
  }
  return item;
}
function including(target, item) {
  if (Array.isArray(target) && !target.includes(item)) {
    target.push(item);
  }
  return target;
}
function remove(target, item) {
  if (Array.isArray(target)) {
    const index = target.indexOf(item);
    if (index >= 0) {
      target.splice(index, 1);
    }
  } else {
    target.delete(item);
  }
  return item;
}
function asArray(source) {
  return Array.isArray(source) ? source : [source];
}
function asCamelCase(str2) {
  return str2.replace(/[\s-]+(.)/g, (_all, chr) => {
    return chr.toUpperCase();
  });
}
function asStringArray(source) {
  return asArray(source).map((item) => {
    return item instanceof String ? item : String(item);
  });
}
function asNumber(source, onNaN = 0) {
  if (source == null) {
    return onNaN;
  }
  const num = parseInt(source, 10);
  return Number.isNaN(num) ? onNaN : num;
}
function prefixedArray(input, prefix) {
  const output = [];
  for (let i = 0, max = input.length; i < max; i++) {
    output.push(prefix, input[i]);
  }
  return output;
}
function bufferToString(input) {
  return (Array.isArray(input) ? import_node_buffer.Buffer.concat(input) : input).toString("utf-8");
}
function pick(source, properties) {
  const out = {};
  properties.forEach((key) => {
    if (source[key] !== void 0) {
      out[key] = source[key];
    }
  });
  return out;
}
function delay(duration = 0) {
  return new Promise((done) => setTimeout(done, duration));
}
function orVoid(input) {
  if (input === false) {
    return void 0;
  }
  return input;
}
var NULL;
var NOOP;
var objectToString;
var init_util = __esm({
  "src/lib/utils/util.ts"() {
    "use strict";
    init_argument_filters();
    NULL = "\0";
    NOOP = () => {
    };
    objectToString = Object.prototype.toString.call.bind(Object.prototype.toString);
  }
});
function filterType(input, filter, def) {
  if (filter(input)) {
    return input;
  }
  return arguments.length > 2 ? def : void 0;
}
function filterPrimitives(input, omit) {
  const type2 = isPathSpec(input) ? "string" : typeof input;
  return /number|string|boolean/.test(type2) && (!omit || !omit.includes(type2));
}
function filterPlainObject(input) {
  return !!input && objectToString(input) === "[object Object]";
}
function filterFunction(input) {
  return typeof input === "function";
}
var filterArray;
var filterNumber;
var filterString;
var filterStringOrStringArray;
var filterHasLength;
var init_argument_filters = __esm({
  "src/lib/utils/argument-filters.ts"() {
    "use strict";
    init_pathspec();
    init_util();
    filterArray = (input) => {
      return Array.isArray(input);
    };
    filterNumber = (input) => {
      return typeof input === "number";
    };
    filterString = (input) => {
      return typeof input === "string";
    };
    filterStringOrStringArray = (input) => {
      return filterString(input) || Array.isArray(input) && input.every(filterString);
    };
    filterHasLength = (input) => {
      if (input == null || "number|boolean|function".includes(typeof input)) {
        return false;
      }
      return typeof input.length === "number";
    };
  }
});
var ExitCodes;
var init_exit_codes = __esm({
  "src/lib/utils/exit-codes.ts"() {
    "use strict";
    ExitCodes = /* @__PURE__ */ ((ExitCodes2) => {
      ExitCodes2[ExitCodes2["SUCCESS"] = 0] = "SUCCESS";
      ExitCodes2[ExitCodes2["ERROR"] = 1] = "ERROR";
      ExitCodes2[ExitCodes2["NOT_FOUND"] = -2] = "NOT_FOUND";
      ExitCodes2[ExitCodes2["UNCLEAN"] = 128] = "UNCLEAN";
      return ExitCodes2;
    })(ExitCodes || {});
  }
});
var GitOutputStreams;
var init_git_output_streams = __esm({
  "src/lib/utils/git-output-streams.ts"() {
    "use strict";
    GitOutputStreams = class _GitOutputStreams {
      constructor(stdOut, stdErr) {
        this.stdOut = stdOut;
        this.stdErr = stdErr;
      }
      asStrings() {
        return new _GitOutputStreams(this.stdOut.toString("utf8"), this.stdErr.toString("utf8"));
      }
    };
  }
});
function useMatchesDefault() {
  throw new Error(`LineParser:useMatches not implemented`);
}
var LineParser;
var RemoteLineParser;
var init_line_parser = __esm({
  "src/lib/utils/line-parser.ts"() {
    "use strict";
    LineParser = class {
      constructor(regExp, useMatches) {
        this.matches = [];
        this.useMatches = useMatchesDefault;
        this.parse = (line, target) => {
          this.resetMatches();
          if (!this._regExp.every((reg, index) => this.addMatch(reg, index, line(index)))) {
            return false;
          }
          return this.useMatches(target, this.prepareMatches()) !== false;
        };
        this._regExp = Array.isArray(regExp) ? regExp : [regExp];
        if (useMatches) {
          this.useMatches = useMatches;
        }
      }
      resetMatches() {
        this.matches.length = 0;
      }
      prepareMatches() {
        return this.matches;
      }
      addMatch(reg, index, line) {
        const matched = line && reg.exec(line);
        if (matched) {
          this.pushMatch(index, matched);
        }
        return !!matched;
      }
      pushMatch(_index, matched) {
        this.matches.push(...matched.slice(1));
      }
    };
    RemoteLineParser = class extends LineParser {
      addMatch(reg, index, line) {
        return /^remote:\s/.test(String(line)) && super.addMatch(reg, index, line);
      }
      pushMatch(index, matched) {
        if (index > 0 || matched.length > 1) {
          super.pushMatch(index, matched);
        }
      }
    };
  }
});
function createInstanceConfig(...options) {
  const baseDir = process.cwd();
  const config = Object.assign(
    { baseDir, ...defaultOptions },
    ...options.filter((o) => typeof o === "object" && o)
  );
  config.baseDir = config.baseDir || baseDir;
  config.trimmed = config.trimmed === true;
  return config;
}
var defaultOptions;
var init_simple_git_options = __esm({
  "src/lib/utils/simple-git-options.ts"() {
    "use strict";
    defaultOptions = {
      binary: "git",
      maxConcurrentProcesses: 5,
      config: [],
      trimmed: false
    };
  }
});
function appendTaskOptions(options, commands = []) {
  if (!filterPlainObject(options)) {
    return commands;
  }
  return Object.keys(options).reduce((commands2, key) => {
    const value = options[key];
    if (isPathSpec(value)) {
      commands2.push(value);
    } else if (filterPrimitives(value, ["boolean"])) {
      commands2.push(key + "=" + value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (!filterPrimitives(v, ["string", "number"])) {
          commands2.push(key + "=" + v);
        }
      }
    } else {
      commands2.push(key);
    }
    return commands2;
  }, commands);
}
function getTrailingOptions(args, initialPrimitive = 0, objectOnly = false) {
  const command = [];
  for (let i = 0, max = initialPrimitive < 0 ? args.length : initialPrimitive; i < max; i++) {
    if ("string|number".includes(typeof args[i])) {
      command.push(String(args[i]));
    }
  }
  appendTaskOptions(trailingOptionsArgument(args), command);
  if (!objectOnly) {
    command.push(...trailingArrayArgument(args));
  }
  return command;
}
function trailingArrayArgument(args) {
  const hasTrailingCallback = typeof last(args) === "function";
  return asStringArray(filterType(last(args, hasTrailingCallback ? 1 : 0), filterArray, []));
}
function trailingOptionsArgument(args) {
  const hasTrailingCallback = filterFunction(last(args));
  return filterType(last(args, hasTrailingCallback ? 1 : 0), filterPlainObject);
}
function trailingFunctionArgument(args, includeNoop = true) {
  const callback = asFunction(last(args));
  return includeNoop || isUserFunction(callback) ? callback : void 0;
}
var init_task_options = __esm({
  "src/lib/utils/task-options.ts"() {
    "use strict";
    init_argument_filters();
    init_util();
    init_pathspec();
  }
});
function callTaskParser(parser4, streams) {
  return parser4(streams.stdOut, streams.stdErr);
}
function parseStringResponse(result, parsers12, texts, trim = true) {
  asArray(texts).forEach((text) => {
    for (let lines = toLinesWithContent(text, trim), i = 0, max = lines.length; i < max; i++) {
      const line = (offset = 0) => {
        if (i + offset >= max) {
          return;
        }
        return lines[i + offset];
      };
      parsers12.some(({ parse: parse2 }) => parse2(line, result));
    }
  });
  return result;
}
var init_task_parser = __esm({
  "src/lib/utils/task-parser.ts"() {
    "use strict";
    init_util();
  }
});
var utils_exports = {};
__export(utils_exports, {
  ExitCodes: () => ExitCodes,
  GitOutputStreams: () => GitOutputStreams,
  LineParser: () => LineParser,
  NOOP: () => NOOP,
  NULL: () => NULL,
  RemoteLineParser: () => RemoteLineParser,
  append: () => append,
  appendTaskOptions: () => appendTaskOptions,
  asArray: () => asArray,
  asCamelCase: () => asCamelCase,
  asFunction: () => asFunction,
  asNumber: () => asNumber,
  asStringArray: () => asStringArray,
  bufferToString: () => bufferToString,
  callTaskParser: () => callTaskParser,
  createInstanceConfig: () => createInstanceConfig,
  delay: () => delay,
  filterArray: () => filterArray,
  filterFunction: () => filterFunction,
  filterHasLength: () => filterHasLength,
  filterNumber: () => filterNumber,
  filterPlainObject: () => filterPlainObject,
  filterPrimitives: () => filterPrimitives,
  filterString: () => filterString,
  filterStringOrStringArray: () => filterStringOrStringArray,
  filterType: () => filterType,
  first: () => first,
  folderExists: () => folderExists,
  forEachLineWithContent: () => forEachLineWithContent,
  getTrailingOptions: () => getTrailingOptions,
  including: () => including,
  isUserFunction: () => isUserFunction,
  last: () => last,
  objectToString: () => objectToString,
  orVoid: () => orVoid,
  parseStringResponse: () => parseStringResponse,
  pick: () => pick,
  prefixedArray: () => prefixedArray,
  remove: () => remove,
  splitOn: () => splitOn,
  toLinesWithContent: () => toLinesWithContent,
  trailingFunctionArgument: () => trailingFunctionArgument,
  trailingOptionsArgument: () => trailingOptionsArgument
});
var init_utils = __esm({
  "src/lib/utils/index.ts"() {
    "use strict";
    init_argument_filters();
    init_exit_codes();
    init_git_output_streams();
    init_line_parser();
    init_simple_git_options();
    init_task_options();
    init_task_parser();
    init_util();
  }
});
var check_is_repo_exports = {};
__export(check_is_repo_exports, {
  CheckRepoActions: () => CheckRepoActions,
  checkIsBareRepoTask: () => checkIsBareRepoTask,
  checkIsRepoRootTask: () => checkIsRepoRootTask,
  checkIsRepoTask: () => checkIsRepoTask
});
function checkIsRepoTask(action) {
  switch (action) {
    case "bare":
      return checkIsBareRepoTask();
    case "root":
      return checkIsRepoRootTask();
  }
  const commands = ["rev-parse", "--is-inside-work-tree"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser
  };
}
function checkIsRepoRootTask() {
  const commands = ["rev-parse", "--git-dir"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser(path10) {
      return /^\.(git)?$/.test(path10.trim());
    }
  };
}
function checkIsBareRepoTask() {
  const commands = ["rev-parse", "--is-bare-repository"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser
  };
}
function isNotRepoMessage(error) {
  return /(Not a git repository|Kein Git-Repository)/i.test(String(error));
}
var CheckRepoActions;
var onError;
var parser;
var init_check_is_repo = __esm({
  "src/lib/tasks/check-is-repo.ts"() {
    "use strict";
    init_utils();
    CheckRepoActions = /* @__PURE__ */ ((CheckRepoActions2) => {
      CheckRepoActions2["BARE"] = "bare";
      CheckRepoActions2["IN_TREE"] = "tree";
      CheckRepoActions2["IS_REPO_ROOT"] = "root";
      return CheckRepoActions2;
    })(CheckRepoActions || {});
    onError = ({ exitCode }, error, done, fail) => {
      if (exitCode === 128 && isNotRepoMessage(error)) {
        return done(Buffer.from("false"));
      }
      fail(error);
    };
    parser = (text) => {
      return text.trim() === "true";
    };
  }
});
function cleanSummaryParser(dryRun, text) {
  const summary = new CleanResponse(dryRun);
  const regexp = dryRun ? dryRunRemovalRegexp : removalRegexp;
  toLinesWithContent(text).forEach((line) => {
    const removed = line.replace(regexp, "");
    summary.paths.push(removed);
    (isFolderRegexp.test(removed) ? summary.folders : summary.files).push(removed);
  });
  return summary;
}
var CleanResponse;
var removalRegexp;
var dryRunRemovalRegexp;
var isFolderRegexp;
var init_CleanSummary = __esm({
  "src/lib/responses/CleanSummary.ts"() {
    "use strict";
    init_utils();
    CleanResponse = class {
      constructor(dryRun) {
        this.dryRun = dryRun;
        this.paths = [];
        this.files = [];
        this.folders = [];
      }
    };
    removalRegexp = /^[a-z]+\s*/i;
    dryRunRemovalRegexp = /^[a-z]+\s+[a-z]+\s*/i;
    isFolderRegexp = /\/$/;
  }
});
var task_exports = {};
__export(task_exports, {
  EMPTY_COMMANDS: () => EMPTY_COMMANDS,
  adhocExecTask: () => adhocExecTask,
  configurationErrorTask: () => configurationErrorTask,
  isBufferTask: () => isBufferTask,
  isEmptyTask: () => isEmptyTask,
  straightThroughBufferTask: () => straightThroughBufferTask,
  straightThroughStringTask: () => straightThroughStringTask
});
function adhocExecTask(parser4) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser: parser4
  };
}
function configurationErrorTask(error) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser() {
      throw typeof error === "string" ? new TaskConfigurationError(error) : error;
    }
  };
}
function straightThroughStringTask(commands, trimmed2 = false) {
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return trimmed2 ? String(text).trim() : text;
    }
  };
}
function straightThroughBufferTask(commands) {
  return {
    commands,
    format: "buffer",
    parser(buffer) {
      return buffer;
    }
  };
}
function isBufferTask(task) {
  return task.format === "buffer";
}
function isEmptyTask(task) {
  return task.format === "empty" || !task.commands.length;
}
var EMPTY_COMMANDS;
var init_task = __esm({
  "src/lib/tasks/task.ts"() {
    "use strict";
    init_task_configuration_error();
    EMPTY_COMMANDS = [];
  }
});
var clean_exports = {};
__export(clean_exports, {
  CONFIG_ERROR_INTERACTIVE_MODE: () => CONFIG_ERROR_INTERACTIVE_MODE,
  CONFIG_ERROR_MODE_REQUIRED: () => CONFIG_ERROR_MODE_REQUIRED,
  CONFIG_ERROR_UNKNOWN_OPTION: () => CONFIG_ERROR_UNKNOWN_OPTION,
  CleanOptions: () => CleanOptions,
  cleanTask: () => cleanTask,
  cleanWithOptionsTask: () => cleanWithOptionsTask,
  isCleanOptionsArray: () => isCleanOptionsArray
});
function cleanWithOptionsTask(mode, customArgs) {
  const { cleanMode, options, valid } = getCleanOptions(mode);
  if (!cleanMode) {
    return configurationErrorTask(CONFIG_ERROR_MODE_REQUIRED);
  }
  if (!valid.options) {
    return configurationErrorTask(CONFIG_ERROR_UNKNOWN_OPTION + JSON.stringify(mode));
  }
  options.push(...customArgs);
  if (options.some(isInteractiveMode)) {
    return configurationErrorTask(CONFIG_ERROR_INTERACTIVE_MODE);
  }
  return cleanTask(cleanMode, options);
}
function cleanTask(mode, customArgs) {
  const commands = ["clean", `-${mode}`, ...customArgs];
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return cleanSummaryParser(mode === "n", text);
    }
  };
}
function isCleanOptionsArray(input) {
  return Array.isArray(input) && input.every((test) => CleanOptionValues.has(test));
}
function getCleanOptions(input) {
  let cleanMode;
  let options = [];
  let valid = { cleanMode: false, options: true };
  input.replace(/[^a-z]i/g, "").split("").forEach((char) => {
    if (isCleanMode(char)) {
      cleanMode = char;
      valid.cleanMode = true;
    } else {
      valid.options = valid.options && isKnownOption(options[options.length] = `-${char}`);
    }
  });
  return {
    cleanMode,
    options,
    valid
  };
}
function isCleanMode(cleanMode) {
  return cleanMode === "f" || cleanMode === "n";
}
function isKnownOption(option) {
  return /^-[a-z]$/i.test(option) && CleanOptionValues.has(option.charAt(1));
}
function isInteractiveMode(option) {
  if (/^-[^\-]/.test(option)) {
    return option.indexOf("i") > 0;
  }
  return option === "--interactive";
}
var CONFIG_ERROR_INTERACTIVE_MODE;
var CONFIG_ERROR_MODE_REQUIRED;
var CONFIG_ERROR_UNKNOWN_OPTION;
var CleanOptions;
var CleanOptionValues;
var init_clean = __esm({
  "src/lib/tasks/clean.ts"() {
    "use strict";
    init_CleanSummary();
    init_utils();
    init_task();
    CONFIG_ERROR_INTERACTIVE_MODE = "Git clean interactive mode is not supported";
    CONFIG_ERROR_MODE_REQUIRED = 'Git clean mode parameter ("n" or "f") is required';
    CONFIG_ERROR_UNKNOWN_OPTION = "Git clean unknown option found in: ";
    CleanOptions = /* @__PURE__ */ ((CleanOptions2) => {
      CleanOptions2["DRY_RUN"] = "n";
      CleanOptions2["FORCE"] = "f";
      CleanOptions2["IGNORED_INCLUDED"] = "x";
      CleanOptions2["IGNORED_ONLY"] = "X";
      CleanOptions2["EXCLUDING"] = "e";
      CleanOptions2["QUIET"] = "q";
      CleanOptions2["RECURSIVE"] = "d";
      return CleanOptions2;
    })(CleanOptions || {});
    CleanOptionValues = /* @__PURE__ */ new Set([
      "i",
      ...asStringArray(Object.values(CleanOptions))
    ]);
  }
});
function configListParser(text) {
  const config = new ConfigList();
  for (const item of configParser(text)) {
    config.addValue(item.file, String(item.key), item.value);
  }
  return config;
}
function configGetParser(text, key) {
  let value = null;
  const values = [];
  const scopes = /* @__PURE__ */ new Map();
  for (const item of configParser(text, key)) {
    if (item.key !== key) {
      continue;
    }
    values.push(value = item.value);
    if (!scopes.has(item.file)) {
      scopes.set(item.file, []);
    }
    scopes.get(item.file).push(value);
  }
  return {
    key,
    paths: Array.from(scopes.keys()),
    scopes,
    value,
    values
  };
}
function configFilePath(filePath) {
  return filePath.replace(/^(file):/, "");
}
function* configParser(text, requestedKey = null) {
  const lines = text.split("\0");
  for (let i = 0, max = lines.length - 1; i < max; ) {
    const file = configFilePath(lines[i++]);
    let value = lines[i++];
    let key = requestedKey;
    if (value.includes("\n")) {
      const line = splitOn(value, "\n");
      key = line[0];
      value = line[1];
    }
    yield { file, key, value };
  }
}
var ConfigList;
var init_ConfigList = __esm({
  "src/lib/responses/ConfigList.ts"() {
    "use strict";
    init_utils();
    ConfigList = class {
      constructor() {
        this.files = [];
        this.values = /* @__PURE__ */ Object.create(null);
      }
      get all() {
        if (!this._all) {
          this._all = this.files.reduce((all, file) => {
            return Object.assign(all, this.values[file]);
          }, {});
        }
        return this._all;
      }
      addFile(file) {
        if (!(file in this.values)) {
          const latest = last(this.files);
          this.values[file] = latest ? Object.create(this.values[latest]) : {};
          this.files.push(file);
        }
        return this.values[file];
      }
      addValue(file, key, value) {
        const values = this.addFile(file);
        if (!Object.hasOwn(values, key)) {
          values[key] = value;
        } else if (Array.isArray(values[key])) {
          values[key].push(value);
        } else {
          values[key] = [values[key], value];
        }
        this._all = void 0;
      }
    };
  }
});
function asConfigScope(scope, fallback) {
  if (typeof scope === "string" && Object.hasOwn(GitConfigScope, scope)) {
    return scope;
  }
  return fallback;
}
function addConfigTask(key, value, append2, scope) {
  const commands = ["config", `--${scope}`];
  if (append2) {
    commands.push("--add");
  }
  commands.push(key, value);
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return text;
    }
  };
}
function getConfigTask(key, scope) {
  const commands = ["config", "--null", "--show-origin", "--get-all", key];
  if (scope) {
    commands.splice(1, 0, `--${scope}`);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return configGetParser(text, key);
    }
  };
}
function listConfigTask(scope) {
  const commands = ["config", "--list", "--show-origin", "--null"];
  if (scope) {
    commands.push(`--${scope}`);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return configListParser(text);
    }
  };
}
function config_default() {
  return {
    addConfig(key, value, ...rest) {
      return this._runTask(
        addConfigTask(
          key,
          value,
          rest[0] === true,
          asConfigScope(
            rest[1],
            "local"
            /* local */
          )
        ),
        trailingFunctionArgument(arguments)
      );
    },
    getConfig(key, scope) {
      return this._runTask(
        getConfigTask(key, asConfigScope(scope, void 0)),
        trailingFunctionArgument(arguments)
      );
    },
    listConfig(...rest) {
      return this._runTask(
        listConfigTask(asConfigScope(rest[0], void 0)),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var GitConfigScope;
var init_config = __esm({
  "src/lib/tasks/config.ts"() {
    "use strict";
    init_ConfigList();
    init_utils();
    GitConfigScope = /* @__PURE__ */ ((GitConfigScope2) => {
      GitConfigScope2["system"] = "system";
      GitConfigScope2["global"] = "global";
      GitConfigScope2["local"] = "local";
      GitConfigScope2["worktree"] = "worktree";
      return GitConfigScope2;
    })(GitConfigScope || {});
  }
});
function isDiffNameStatus(input) {
  return diffNameStatus.has(input);
}
var DiffNameStatus;
var diffNameStatus;
var init_diff_name_status = __esm({
  "src/lib/tasks/diff-name-status.ts"() {
    "use strict";
    DiffNameStatus = /* @__PURE__ */ ((DiffNameStatus2) => {
      DiffNameStatus2["ADDED"] = "A";
      DiffNameStatus2["COPIED"] = "C";
      DiffNameStatus2["DELETED"] = "D";
      DiffNameStatus2["MODIFIED"] = "M";
      DiffNameStatus2["RENAMED"] = "R";
      DiffNameStatus2["CHANGED"] = "T";
      DiffNameStatus2["UNMERGED"] = "U";
      DiffNameStatus2["UNKNOWN"] = "X";
      DiffNameStatus2["BROKEN"] = "B";
      return DiffNameStatus2;
    })(DiffNameStatus || {});
    diffNameStatus = new Set(Object.values(DiffNameStatus));
  }
});
function grepQueryBuilder(...params) {
  return new GrepQuery().param(...params);
}
function parseGrep(grep) {
  const paths = /* @__PURE__ */ new Set();
  const results = {};
  forEachLineWithContent(grep, (input) => {
    const [path10, line, preview] = input.split(NULL);
    paths.add(path10);
    (results[path10] = results[path10] || []).push({
      line: asNumber(line),
      path: path10,
      preview
    });
  });
  return {
    paths,
    results
  };
}
function grep_default() {
  return {
    grep(searchTerm) {
      const then = trailingFunctionArgument(arguments);
      const options = getTrailingOptions(arguments);
      for (const option of disallowedOptions) {
        if (options.includes(option)) {
          return this._runTask(
            configurationErrorTask(`git.grep: use of "${option}" is not supported.`),
            then
          );
        }
      }
      if (typeof searchTerm === "string") {
        searchTerm = grepQueryBuilder().param(searchTerm);
      }
      const commands = ["grep", "--null", "-n", "--full-name", ...options, ...searchTerm];
      return this._runTask(
        {
          commands,
          format: "utf-8",
          parser(stdOut) {
            return parseGrep(stdOut);
          }
        },
        then
      );
    }
  };
}
var disallowedOptions;
var Query;
var _a;
var GrepQuery;
var init_grep = __esm({
  "src/lib/tasks/grep.ts"() {
    "use strict";
    init_utils();
    init_task();
    disallowedOptions = ["-h"];
    Query = /* @__PURE__ */ Symbol("grepQuery");
    GrepQuery = class {
      constructor() {
        this[_a] = [];
      }
      *[(_a = Query, Symbol.iterator)]() {
        for (const query of this[Query]) {
          yield query;
        }
      }
      and(...and) {
        and.length && this[Query].push("--and", "(", ...prefixedArray(and, "-e"), ")");
        return this;
      }
      param(...param) {
        this[Query].push(...prefixedArray(param, "-e"));
        return this;
      }
    };
  }
});
var reset_exports = {};
__export(reset_exports, {
  ResetMode: () => ResetMode,
  getResetMode: () => getResetMode,
  resetTask: () => resetTask
});
function resetTask(mode, customArgs) {
  const commands = ["reset"];
  if (isValidResetMode(mode)) {
    commands.push(`--${mode}`);
  }
  commands.push(...customArgs);
  return straightThroughStringTask(commands);
}
function getResetMode(mode) {
  if (isValidResetMode(mode)) {
    return mode;
  }
  switch (typeof mode) {
    case "string":
    case "undefined":
      return "soft";
  }
  return;
}
function isValidResetMode(mode) {
  return typeof mode === "string" && validResetModes.includes(mode);
}
var ResetMode;
var validResetModes;
var init_reset = __esm({
  "src/lib/tasks/reset.ts"() {
    "use strict";
    init_utils();
    init_task();
    ResetMode = /* @__PURE__ */ ((ResetMode2) => {
      ResetMode2["MIXED"] = "mixed";
      ResetMode2["SOFT"] = "soft";
      ResetMode2["HARD"] = "hard";
      ResetMode2["MERGE"] = "merge";
      ResetMode2["KEEP"] = "keep";
      return ResetMode2;
    })(ResetMode || {});
    validResetModes = asStringArray(Object.values(ResetMode));
  }
});
function createLog() {
  return (0, import_debug.default)("simple-git");
}
function prefixedLogger(to, prefix, forward) {
  if (!prefix || !String(prefix).replace(/\s*/, "")) {
    return !forward ? to : (message, ...args) => {
      to(message, ...args);
      forward(message, ...args);
    };
  }
  return (message, ...args) => {
    to(`%s ${message}`, prefix, ...args);
    if (forward) {
      forward(message, ...args);
    }
  };
}
function childLoggerName(name, childDebugger, { namespace: parentNamespace }) {
  if (typeof name === "string") {
    return name;
  }
  const childNamespace = childDebugger && childDebugger.namespace || "";
  if (childNamespace.startsWith(parentNamespace)) {
    return childNamespace.substr(parentNamespace.length + 1);
  }
  return childNamespace || parentNamespace;
}
function createLogger(label, verbose, initialStep, infoDebugger = createLog()) {
  const labelPrefix = label && `[${label}]` || "";
  const spawned = [];
  const debugDebugger = typeof verbose === "string" ? infoDebugger.extend(verbose) : verbose;
  const key = childLoggerName(filterType(verbose, filterString), debugDebugger, infoDebugger);
  return step(initialStep);
  function sibling(name, initial) {
    return append(
      spawned,
      createLogger(label, key.replace(/^[^:]+/, name), initial, infoDebugger)
    );
  }
  function step(phase) {
    const stepPrefix = phase && `[${phase}]` || "";
    const debug2 = debugDebugger && prefixedLogger(debugDebugger, stepPrefix) || NOOP;
    const info = prefixedLogger(infoDebugger, `${labelPrefix} ${stepPrefix}`, debug2);
    return Object.assign(debugDebugger ? debug2 : info, {
      label,
      sibling,
      info,
      step
    });
  }
}
var init_git_logger = __esm({
  "src/lib/git-logger.ts"() {
    "use strict";
    init_utils();
    import_debug.default.formatters.L = (value) => String(filterHasLength(value) ? value.length : "-");
    import_debug.default.formatters.B = (value) => {
      if (Buffer.isBuffer(value)) {
        return value.toString("utf8");
      }
      return objectToString(value);
    };
  }
});
var TasksPendingQueue;
var init_tasks_pending_queue = __esm({
  "src/lib/runners/tasks-pending-queue.ts"() {
    "use strict";
    init_git_error();
    init_git_logger();
    TasksPendingQueue = class _TasksPendingQueue {
      constructor(logLabel = "GitExecutor") {
        this.logLabel = logLabel;
        this._queue = /* @__PURE__ */ new Map();
      }
      withProgress(task) {
        return this._queue.get(task);
      }
      createProgress(task) {
        const name = _TasksPendingQueue.getName(task.commands[0]);
        const logger = createLogger(this.logLabel, name);
        return {
          task,
          logger,
          name
        };
      }
      push(task) {
        const progress = this.createProgress(task);
        progress.logger("Adding task to the queue, commands = %o", task.commands);
        this._queue.set(task, progress);
        return progress;
      }
      fatal(err) {
        for (const [task, { logger }] of Array.from(this._queue.entries())) {
          if (task === err.task) {
            logger.info(`Failed %o`, err);
            logger(
              `Fatal exception, any as-yet un-started tasks run through this executor will not be attempted`
            );
          } else {
            logger.info(
              `A fatal exception occurred in a previous task, the queue has been purged: %o`,
              err.message
            );
          }
          this.complete(task);
        }
        if (this._queue.size !== 0) {
          throw new Error(`Queue size should be zero after fatal: ${this._queue.size}`);
        }
      }
      complete(task) {
        const progress = this.withProgress(task);
        if (progress) {
          this._queue.delete(task);
        }
      }
      attempt(task) {
        const progress = this.withProgress(task);
        if (!progress) {
          throw new GitError(void 0, "TasksPendingQueue: attempt called for an unknown task");
        }
        progress.logger("Starting task");
        return progress;
      }
      static getName(name = "empty") {
        return `task:${name}:${++_TasksPendingQueue.counter}`;
      }
      static {
        this.counter = 0;
      }
    };
  }
});
function pluginContext(task, commands) {
  return {
    method: first(task.commands) || "",
    commands
  };
}
function onErrorReceived(target, logger) {
  return (err) => {
    logger(`[ERROR] child process exception %o`, err);
    target.push(Buffer.from(String(err.stack), "ascii"));
  };
}
function onDataReceived(target, name, logger, output) {
  return (buffer) => {
    logger(`%s received %L bytes`, name, buffer);
    output(`%B`, buffer);
    target.push(buffer);
  };
}
var GitExecutorChain;
var init_git_executor_chain = __esm({
  "src/lib/runners/git-executor-chain.ts"() {
    "use strict";
    init_git_error();
    init_task();
    init_utils();
    init_tasks_pending_queue();
    GitExecutorChain = class {
      constructor(_executor, _scheduler, _plugins) {
        this._executor = _executor;
        this._scheduler = _scheduler;
        this._plugins = _plugins;
        this._chain = Promise.resolve();
        this._queue = new TasksPendingQueue();
      }
      get cwd() {
        return this._cwd || this._executor.cwd;
      }
      set cwd(cwd) {
        this._cwd = cwd;
      }
      get env() {
        return this._executor.env;
      }
      get outputHandler() {
        return this._executor.outputHandler;
      }
      chain() {
        return this;
      }
      push(task) {
        this._queue.push(task);
        return this._chain = this._chain.then(() => this.attemptTask(task));
      }
      async attemptTask(task) {
        const onScheduleComplete = await this._scheduler.next();
        const onQueueComplete = () => this._queue.complete(task);
        try {
          const { logger } = this._queue.attempt(task);
          return await (isEmptyTask(task) ? this.attemptEmptyTask(task, logger) : this.attemptRemoteTask(task, logger));
        } catch (e) {
          throw this.onFatalException(task, e);
        } finally {
          onQueueComplete();
          onScheduleComplete();
        }
      }
      onFatalException(task, e) {
        const gitError = e instanceof GitError ? Object.assign(e, { task }) : new GitError(task, e && String(e));
        this._chain = Promise.resolve();
        this._queue.fatal(gitError);
        return gitError;
      }
      async attemptRemoteTask(task, logger) {
        const binary2 = this._plugins.exec("spawn.binary", "", pluginContext(task, task.commands));
        const args = this._plugins.exec(
          "spawn.args",
          [...task.commands],
          pluginContext(task, task.commands)
        );
        const raw = await this.gitResponse(
          task,
          binary2,
          args,
          this.outputHandler,
          logger.step("SPAWN")
        );
        const outputStreams = await this.handleTaskData(task, args, raw, logger.step("HANDLE"));
        logger(`passing response to task's parser as a %s`, task.format);
        if (isBufferTask(task)) {
          return callTaskParser(task.parser, outputStreams);
        }
        return callTaskParser(task.parser, outputStreams.asStrings());
      }
      async attemptEmptyTask(task, logger) {
        logger(`empty task bypassing child process to call to task's parser`);
        return task.parser(this);
      }
      handleTaskData(task, args, result, logger) {
        const { exitCode, rejection, stdOut, stdErr } = result;
        return new Promise((done, fail) => {
          logger(`Preparing to handle process response exitCode=%d stdOut=`, exitCode);
          const { error } = this._plugins.exec(
            "task.error",
            { error: rejection },
            {
              ...pluginContext(task, args),
              ...result
            }
          );
          if (error && task.onError) {
            logger.info(`exitCode=%s handling with custom error handler`);
            return task.onError(
              result,
              error,
              (newStdOut) => {
                logger.info(`custom error handler treated as success`);
                logger(`custom error returned a %s`, objectToString(newStdOut));
                done(
                  new GitOutputStreams(
                    Array.isArray(newStdOut) ? Buffer.concat(newStdOut) : newStdOut,
                    Buffer.concat(stdErr)
                  )
                );
              },
              fail
            );
          }
          if (error) {
            logger.info(
              `handling as error: exitCode=%s stdErr=%s rejection=%o`,
              exitCode,
              stdErr.length,
              rejection
            );
            return fail(error);
          }
          logger.info(`retrieving task output complete`);
          done(new GitOutputStreams(Buffer.concat(stdOut), Buffer.concat(stdErr)));
        });
      }
      async gitResponse(task, command, args, outputHandler, logger) {
        const outputLogger = logger.sibling("output");
        const spawnOptions = this._plugins.exec(
          "spawn.options",
          {
            cwd: this.cwd,
            env: this.env,
            windowsHide: true
          },
          pluginContext(task, task.commands)
        );
        return new Promise((done) => {
          const stdOut = [];
          const stdErr = [];
          logger.info(`%s %o`, command, args);
          logger("%O", spawnOptions);
          let rejection = this._beforeSpawn(task, args);
          if (rejection) {
            return done({
              stdOut,
              stdErr,
              exitCode: 9901,
              rejection
            });
          }
          this._plugins.exec("spawn.before", void 0, {
            ...pluginContext(task, args),
            kill(reason) {
              rejection = reason || rejection;
            }
          });
          const spawned = (0, import_child_process.spawn)(command, args, spawnOptions);
          spawned.stdout.on(
            "data",
            onDataReceived(stdOut, "stdOut", logger, outputLogger.step("stdOut"))
          );
          spawned.stderr.on(
            "data",
            onDataReceived(stdErr, "stdErr", logger, outputLogger.step("stdErr"))
          );
          spawned.on("error", onErrorReceived(stdErr, logger));
          if (outputHandler) {
            logger(`Passing child process stdOut/stdErr to custom outputHandler`);
            outputHandler(command, spawned.stdout, spawned.stderr, [...args]);
          }
          this._plugins.exec("spawn.after", void 0, {
            ...pluginContext(task, args),
            spawned,
            close(exitCode, reason) {
              done({
                stdOut,
                stdErr,
                exitCode,
                rejection: rejection || reason
              });
            },
            kill(reason) {
              if (spawned.killed) {
                return;
              }
              rejection = reason;
              spawned.kill("SIGINT");
            }
          });
        });
      }
      _beforeSpawn(task, args) {
        let rejection;
        this._plugins.exec("spawn.before", void 0, {
          ...pluginContext(task, args),
          kill(reason) {
            rejection = reason || rejection;
          }
        });
        return rejection;
      }
    };
  }
});
var git_executor_exports = {};
__export(git_executor_exports, {
  GitExecutor: () => GitExecutor
});
var GitExecutor;
var init_git_executor = __esm({
  "src/lib/runners/git-executor.ts"() {
    "use strict";
    init_git_executor_chain();
    GitExecutor = class {
      constructor(cwd, _scheduler, _plugins) {
        this.cwd = cwd;
        this._scheduler = _scheduler;
        this._plugins = _plugins;
        this._chain = new GitExecutorChain(this, this._scheduler, this._plugins);
      }
      chain() {
        return new GitExecutorChain(this, this._scheduler, this._plugins);
      }
      push(task) {
        return this._chain.push(task);
      }
    };
  }
});
function taskCallback(task, response, callback = NOOP) {
  const onSuccess = (data) => {
    callback(null, data);
  };
  const onError2 = (err) => {
    if (err?.task === task) {
      callback(
        err instanceof GitResponseError ? addDeprecationNoticeToError(err) : err,
        void 0
      );
    }
  };
  response.then(onSuccess, onError2);
}
function addDeprecationNoticeToError(err) {
  let log = (name) => {
    console.warn(
      `simple-git deprecation notice: accessing GitResponseError.${name} should be GitResponseError.git.${name}, this will no longer be available in version 3`
    );
    log = NOOP;
  };
  return Object.create(err, Object.getOwnPropertyNames(err.git).reduce(descriptorReducer, {}));
  function descriptorReducer(all, name) {
    if (name in err) {
      return all;
    }
    all[name] = {
      enumerable: false,
      configurable: false,
      get() {
        log(name);
        return err.git[name];
      }
    };
    return all;
  }
}
var init_task_callback = __esm({
  "src/lib/task-callback.ts"() {
    "use strict";
    init_git_response_error();
    init_utils();
  }
});
function changeWorkingDirectoryTask(directory, root) {
  return adhocExecTask((instance) => {
    if (!folderExists(directory)) {
      throw new Error(`Git.cwd: cannot change to non-directory "${directory}"`);
    }
    return (root || instance).cwd = directory;
  });
}
var init_change_working_directory = __esm({
  "src/lib/tasks/change-working-directory.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function checkoutTask(args) {
  const commands = ["checkout", ...args];
  if (commands[1] === "-b" && commands.includes("-B")) {
    commands[1] = remove(commands, "-B");
  }
  return straightThroughStringTask(commands);
}
function checkout_default() {
  return {
    checkout() {
      return this._runTask(
        checkoutTask(getTrailingOptions(arguments, 1)),
        trailingFunctionArgument(arguments)
      );
    },
    checkoutBranch(branchName, startPoint) {
      return this._runTask(
        checkoutTask(["-b", branchName, startPoint, ...getTrailingOptions(arguments)]),
        trailingFunctionArgument(arguments)
      );
    },
    checkoutLocalBranch(branchName) {
      return this._runTask(
        checkoutTask(["-b", branchName, ...getTrailingOptions(arguments)]),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_checkout = __esm({
  "src/lib/tasks/checkout.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function countObjectsResponse() {
  return {
    count: 0,
    garbage: 0,
    inPack: 0,
    packs: 0,
    prunePackable: 0,
    size: 0,
    sizeGarbage: 0,
    sizePack: 0
  };
}
function count_objects_default() {
  return {
    countObjects() {
      return this._runTask({
        commands: ["count-objects", "--verbose"],
        format: "utf-8",
        parser(stdOut) {
          return parseStringResponse(countObjectsResponse(), [parser2], stdOut);
        }
      });
    }
  };
}
var parser2;
var init_count_objects = __esm({
  "src/lib/tasks/count-objects.ts"() {
    "use strict";
    init_utils();
    parser2 = new LineParser(
      /([a-z-]+): (\d+)$/,
      (result, [key, value]) => {
        const property = asCamelCase(key);
        if (Object.hasOwn(result, property)) {
          result[property] = asNumber(value);
        }
      }
    );
  }
});
function parseCommitResult(stdOut) {
  const result = {
    author: null,
    branch: "",
    commit: "",
    root: false,
    summary: {
      changes: 0,
      insertions: 0,
      deletions: 0
    }
  };
  return parseStringResponse(result, parsers, stdOut);
}
var parsers;
var init_parse_commit = __esm({
  "src/lib/parsers/parse-commit.ts"() {
    "use strict";
    init_utils();
    parsers = [
      new LineParser(/^\[([^\s]+)( \([^)]+\))? ([^\]]+)/, (result, [branch, root, commit]) => {
        result.branch = branch;
        result.commit = commit;
        result.root = !!root;
      }),
      new LineParser(/\s*Author:\s(.+)/i, (result, [author]) => {
        const parts = author.split("<");
        const email = parts.pop();
        if (!email || !email.includes("@")) {
          return;
        }
        result.author = {
          email: email.substr(0, email.length - 1),
          name: parts.join("<").trim()
        };
      }),
      new LineParser(
        /(\d+)[^,]*(?:,\s*(\d+)[^,]*)(?:,\s*(\d+))/g,
        (result, [changes, insertions, deletions]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          result.summary.insertions = parseInt(insertions, 10) || 0;
          result.summary.deletions = parseInt(deletions, 10) || 0;
        }
      ),
      new LineParser(
        /^(\d+)[^,]*(?:,\s*(\d+)[^(]+\(([+-]))?/,
        (result, [changes, lines, direction]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          const count = parseInt(lines, 10) || 0;
          if (direction === "-") {
            result.summary.deletions = count;
          } else if (direction === "+") {
            result.summary.insertions = count;
          }
        }
      )
    ];
  }
});
function commitTask(message, files, customArgs) {
  const commands = [
    "-c",
    "core.abbrev=40",
    "commit",
    ...prefixedArray(message, "-m"),
    ...files,
    ...customArgs
  ];
  return {
    commands,
    format: "utf-8",
    parser: parseCommitResult
  };
}
function commit_default() {
  return {
    commit(message, ...rest) {
      const next = trailingFunctionArgument(arguments);
      const task = rejectDeprecatedSignatures(message) || commitTask(
        asArray(message),
        asArray(filterType(rest[0], filterStringOrStringArray, [])),
        [
          ...asStringArray(filterType(rest[1], filterArray, [])),
          ...getTrailingOptions(arguments, 0, true)
        ]
      );
      return this._runTask(task, next);
    }
  };
  function rejectDeprecatedSignatures(message) {
    return !filterStringOrStringArray(message) && configurationErrorTask(
      `git.commit: requires the commit message to be supplied as a string/string[]`
    );
  }
}
var init_commit = __esm({
  "src/lib/tasks/commit.ts"() {
    "use strict";
    init_parse_commit();
    init_utils();
    init_task();
  }
});
function first_commit_default() {
  return {
    firstCommit() {
      return this._runTask(
        straightThroughStringTask(["rev-list", "--max-parents=0", "HEAD"], true),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_first_commit = __esm({
  "src/lib/tasks/first-commit.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function hashObjectTask(filePath, write) {
  const commands = ["hash-object", filePath];
  if (write) {
    commands.push("-w");
  }
  return straightThroughStringTask(commands, true);
}
var init_hash_object = __esm({
  "src/lib/tasks/hash-object.ts"() {
    "use strict";
    init_task();
  }
});
function parseInit(bare, path10, text) {
  const response = String(text).trim();
  let result;
  if (result = initResponseRegex.exec(response)) {
    return new InitSummary(bare, path10, false, result[1]);
  }
  if (result = reInitResponseRegex.exec(response)) {
    return new InitSummary(bare, path10, true, result[1]);
  }
  let gitDir = "";
  const tokens = response.split(" ");
  while (tokens.length) {
    const token = tokens.shift();
    if (token === "in") {
      gitDir = tokens.join(" ");
      break;
    }
  }
  return new InitSummary(bare, path10, /^re/i.test(response), gitDir);
}
var InitSummary;
var initResponseRegex;
var reInitResponseRegex;
var init_InitSummary = __esm({
  "src/lib/responses/InitSummary.ts"() {
    "use strict";
    InitSummary = class {
      constructor(bare, path10, existing, gitDir) {
        this.bare = bare;
        this.path = path10;
        this.existing = existing;
        this.gitDir = gitDir;
      }
    };
    initResponseRegex = /^Init.+ repository in (.+)$/;
    reInitResponseRegex = /^Rein.+ in (.+)$/;
  }
});
function hasBareCommand(command) {
  return command.includes(bareCommand);
}
function initTask(bare = false, path10, customArgs) {
  const commands = ["init", ...customArgs];
  if (bare && !hasBareCommand(commands)) {
    commands.splice(1, 0, bareCommand);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return parseInit(commands.includes("--bare"), path10, text);
    }
  };
}
var bareCommand;
var init_init = __esm({
  "src/lib/tasks/init.ts"() {
    "use strict";
    init_InitSummary();
    bareCommand = "--bare";
  }
});
function logFormatFromCommand(customArgs) {
  for (let i = 0; i < customArgs.length; i++) {
    const format = logFormatRegex.exec(customArgs[i]);
    if (format) {
      return `--${format[1]}`;
    }
  }
  return "";
}
function isLogFormat(customArg) {
  return logFormatRegex.test(customArg);
}
var logFormatRegex;
var init_log_format = __esm({
  "src/lib/args/log-format.ts"() {
    "use strict";
    logFormatRegex = /^--(stat|numstat|name-only|name-status)(=|$)/;
  }
});
var DiffSummary;
var init_DiffSummary = __esm({
  "src/lib/responses/DiffSummary.ts"() {
    "use strict";
    DiffSummary = class {
      constructor() {
        this.changed = 0;
        this.deletions = 0;
        this.insertions = 0;
        this.files = [];
      }
    };
  }
});
function getDiffParser(format = "") {
  const parser4 = diffSummaryParsers[format];
  return (stdOut) => parseStringResponse(new DiffSummary(), parser4, stdOut, false);
}
var statParser;
var numStatParser;
var nameOnlyParser;
var nameStatusParser;
var diffSummaryParsers;
var init_parse_diff_summary = __esm({
  "src/lib/parsers/parse-diff-summary.ts"() {
    "use strict";
    init_log_format();
    init_DiffSummary();
    init_diff_name_status();
    init_utils();
    statParser = [
      new LineParser(
        /^(.+)\s+\|\s+(\d+)(\s+[+\-]+)?$/,
        (result, [file, changes, alterations = ""]) => {
          result.files.push({
            file: file.trim(),
            changes: asNumber(changes),
            insertions: alterations.replace(/[^+]/g, "").length,
            deletions: alterations.replace(/[^-]/g, "").length,
            binary: false
          });
        }
      ),
      new LineParser(
        /^(.+) \|\s+Bin ([0-9.]+) -> ([0-9.]+) ([a-z]+)/,
        (result, [file, before, after]) => {
          result.files.push({
            file: file.trim(),
            before: asNumber(before),
            after: asNumber(after),
            binary: true
          });
        }
      ),
      new LineParser(
        /(\d+) files? changed\s*((?:, \d+ [^,]+){0,2})/,
        (result, [changed, summary]) => {
          const inserted = /(\d+) i/.exec(summary);
          const deleted = /(\d+) d/.exec(summary);
          result.changed = asNumber(changed);
          result.insertions = asNumber(inserted?.[1]);
          result.deletions = asNumber(deleted?.[1]);
        }
      )
    ];
    numStatParser = [
      new LineParser(
        /(\d+)\t(\d+)\t(.+)$/,
        (result, [changesInsert, changesDelete, file]) => {
          const insertions = asNumber(changesInsert);
          const deletions = asNumber(changesDelete);
          result.changed++;
          result.insertions += insertions;
          result.deletions += deletions;
          result.files.push({
            file,
            changes: insertions + deletions,
            insertions,
            deletions,
            binary: false
          });
        }
      ),
      new LineParser(/-\t-\t(.+)$/, (result, [file]) => {
        result.changed++;
        result.files.push({
          file,
          after: 0,
          before: 0,
          binary: true
        });
      })
    ];
    nameOnlyParser = [
      new LineParser(/(.+)$/, (result, [file]) => {
        result.changed++;
        result.files.push({
          file,
          changes: 0,
          insertions: 0,
          deletions: 0,
          binary: false
        });
      })
    ];
    nameStatusParser = [
      new LineParser(
        /([ACDMRTUXB])([0-9]{0,3})\t(.[^\t]*)(\t(.[^\t]*))?$/,
        (result, [status, similarity, from, _to, to]) => {
          result.changed++;
          result.files.push({
            file: to ?? from,
            changes: 0,
            insertions: 0,
            deletions: 0,
            binary: false,
            status: orVoid(isDiffNameStatus(status) && status),
            from: orVoid(!!to && from !== to && from),
            similarity: asNumber(similarity)
          });
        }
      )
    ];
    diffSummaryParsers = {
      [
        ""
        /* NONE */
      ]: statParser,
      [
        "--stat"
        /* STAT */
      ]: statParser,
      [
        "--numstat"
        /* NUM_STAT */
      ]: numStatParser,
      [
        "--name-status"
        /* NAME_STATUS */
      ]: nameStatusParser,
      [
        "--name-only"
        /* NAME_ONLY */
      ]: nameOnlyParser
    };
  }
});
function lineBuilder(tokens, fields) {
  return fields.reduce(
    (line, field, index) => {
      line[field] = tokens[index] || "";
      return line;
    },
    /* @__PURE__ */ Object.create({ diff: null })
  );
}
function createListLogSummaryParser(splitter = SPLITTER, fields = defaultFieldNames, logFormat = "") {
  const parseDiffResult = getDiffParser(logFormat);
  return function(stdOut) {
    const all = toLinesWithContent(
      stdOut.trim(),
      false,
      START_BOUNDARY
    ).map(function(item) {
      const lineDetail = item.split(COMMIT_BOUNDARY);
      const listLogLine = lineBuilder(lineDetail[0].split(splitter), fields);
      if (lineDetail.length > 1 && !!lineDetail[1].trim()) {
        listLogLine.diff = parseDiffResult(lineDetail[1]);
      }
      return listLogLine;
    });
    return {
      all,
      latest: all.length && all[0] || null,
      total: all.length
    };
  };
}
var START_BOUNDARY;
var COMMIT_BOUNDARY;
var SPLITTER;
var defaultFieldNames;
var init_parse_list_log_summary = __esm({
  "src/lib/parsers/parse-list-log-summary.ts"() {
    "use strict";
    init_utils();
    init_parse_diff_summary();
    init_log_format();
    START_BOUNDARY = "\xF2\xF2\xF2\xF2\xF2\xF2 ";
    COMMIT_BOUNDARY = " \xF2\xF2";
    SPLITTER = " \xF2 ";
    defaultFieldNames = ["hash", "date", "message", "refs", "author_name", "author_email"];
  }
});
var diff_exports = {};
__export(diff_exports, {
  diffSummaryTask: () => diffSummaryTask,
  validateLogFormatConfig: () => validateLogFormatConfig
});
function diffSummaryTask(customArgs) {
  let logFormat = logFormatFromCommand(customArgs);
  const commands = ["diff"];
  if (logFormat === "") {
    logFormat = "--stat";
    commands.push("--stat=4096");
  }
  commands.push(...customArgs);
  return validateLogFormatConfig(commands) || {
    commands,
    format: "utf-8",
    parser: getDiffParser(logFormat)
  };
}
function validateLogFormatConfig(customArgs) {
  const flags = customArgs.filter(isLogFormat);
  if (flags.length > 1) {
    return configurationErrorTask(
      `Summary flags are mutually exclusive - pick one of ${flags.join(",")}`
    );
  }
  if (flags.length && customArgs.includes("-z")) {
    return configurationErrorTask(
      `Summary flag ${flags} parsing is not compatible with null termination option '-z'`
    );
  }
}
var init_diff = __esm({
  "src/lib/tasks/diff.ts"() {
    "use strict";
    init_log_format();
    init_parse_diff_summary();
    init_task();
  }
});
function prettyFormat(format, splitter) {
  const fields = [];
  const formatStr = [];
  Object.keys(format).forEach((field) => {
    fields.push(field);
    formatStr.push(String(format[field]));
  });
  return [fields, formatStr.join(splitter)];
}
function userOptions(input) {
  return Object.keys(input).reduce((out, key) => {
    if (!(key in excludeOptions)) {
      out[key] = input[key];
    }
    return out;
  }, {});
}
function parseLogOptions(opt = {}, customArgs = []) {
  const splitter = filterType(opt.splitter, filterString, SPLITTER);
  const format = filterPlainObject(opt.format) ? opt.format : {
    hash: "%H",
    date: opt.strictDate === false ? "%ai" : "%aI",
    message: "%s",
    refs: "%D",
    body: opt.multiLine ? "%B" : "%b",
    author_name: opt.mailMap !== false ? "%aN" : "%an",
    author_email: opt.mailMap !== false ? "%aE" : "%ae"
  };
  const [fields, formatStr] = prettyFormat(format, splitter);
  const suffix = [];
  const command = [
    `--pretty=format:${START_BOUNDARY}${formatStr}${COMMIT_BOUNDARY}`,
    ...customArgs
  ];
  const maxCount = opt.n || opt["max-count"] || opt.maxCount;
  if (maxCount) {
    command.push(`--max-count=${maxCount}`);
  }
  if (opt.from || opt.to) {
    const rangeOperator = opt.symmetric !== false ? "..." : "..";
    suffix.push(`${opt.from || ""}${rangeOperator}${opt.to || ""}`);
  }
  if (filterString(opt.file)) {
    command.push("--follow", pathspec(opt.file));
  }
  appendTaskOptions(userOptions(opt), command);
  return {
    fields,
    splitter,
    commands: [...command, ...suffix]
  };
}
function logTask(splitter, fields, customArgs) {
  const parser4 = createListLogSummaryParser(splitter, fields, logFormatFromCommand(customArgs));
  return {
    commands: ["log", ...customArgs],
    format: "utf-8",
    parser: parser4
  };
}
function log_default() {
  return {
    log(...rest) {
      const next = trailingFunctionArgument(arguments);
      const options = parseLogOptions(
        trailingOptionsArgument(arguments),
        asStringArray(filterType(arguments[0], filterArray, []))
      );
      const task = rejectDeprecatedSignatures(...rest) || validateLogFormatConfig(options.commands) || createLogTask(options);
      return this._runTask(task, next);
    }
  };
  function createLogTask(options) {
    return logTask(options.splitter, options.fields, options.commands);
  }
  function rejectDeprecatedSignatures(from, to) {
    return filterString(from) && filterString(to) && configurationErrorTask(
      `git.log(string, string) should be replaced with git.log({ from: string, to: string })`
    );
  }
}
var excludeOptions;
var init_log = __esm({
  "src/lib/tasks/log.ts"() {
    "use strict";
    init_log_format();
    init_pathspec();
    init_parse_list_log_summary();
    init_utils();
    init_task();
    init_diff();
    excludeOptions = /* @__PURE__ */ ((excludeOptions2) => {
      excludeOptions2[excludeOptions2["--pretty"] = 0] = "--pretty";
      excludeOptions2[excludeOptions2["max-count"] = 1] = "max-count";
      excludeOptions2[excludeOptions2["maxCount"] = 2] = "maxCount";
      excludeOptions2[excludeOptions2["n"] = 3] = "n";
      excludeOptions2[excludeOptions2["file"] = 4] = "file";
      excludeOptions2[excludeOptions2["format"] = 5] = "format";
      excludeOptions2[excludeOptions2["from"] = 6] = "from";
      excludeOptions2[excludeOptions2["to"] = 7] = "to";
      excludeOptions2[excludeOptions2["splitter"] = 8] = "splitter";
      excludeOptions2[excludeOptions2["symmetric"] = 9] = "symmetric";
      excludeOptions2[excludeOptions2["mailMap"] = 10] = "mailMap";
      excludeOptions2[excludeOptions2["multiLine"] = 11] = "multiLine";
      excludeOptions2[excludeOptions2["strictDate"] = 12] = "strictDate";
      return excludeOptions2;
    })(excludeOptions || {});
  }
});
var MergeSummaryConflict;
var MergeSummaryDetail;
var init_MergeSummary = __esm({
  "src/lib/responses/MergeSummary.ts"() {
    "use strict";
    MergeSummaryConflict = class {
      constructor(reason, file = null, meta) {
        this.reason = reason;
        this.file = file;
        this.meta = meta;
      }
      toString() {
        return `${this.file}:${this.reason}`;
      }
    };
    MergeSummaryDetail = class {
      constructor() {
        this.conflicts = [];
        this.merges = [];
        this.result = "success";
      }
      get failed() {
        return this.conflicts.length > 0;
      }
      get reason() {
        return this.result;
      }
      toString() {
        if (this.conflicts.length) {
          return `CONFLICTS: ${this.conflicts.join(", ")}`;
        }
        return "OK";
      }
    };
  }
});
var PullSummary;
var PullFailedSummary;
var init_PullSummary = __esm({
  "src/lib/responses/PullSummary.ts"() {
    "use strict";
    PullSummary = class {
      constructor() {
        this.remoteMessages = {
          all: []
        };
        this.created = [];
        this.deleted = [];
        this.files = [];
        this.deletions = {};
        this.insertions = {};
        this.summary = {
          changes: 0,
          deletions: 0,
          insertions: 0
        };
      }
    };
    PullFailedSummary = class {
      constructor() {
        this.remote = "";
        this.hash = {
          local: "",
          remote: ""
        };
        this.branch = {
          local: "",
          remote: ""
        };
        this.message = "";
      }
      toString() {
        return this.message;
      }
    };
  }
});
function objectEnumerationResult(remoteMessages) {
  return remoteMessages.objects = remoteMessages.objects || {
    compressing: 0,
    counting: 0,
    enumerating: 0,
    packReused: 0,
    reused: { count: 0, delta: 0 },
    total: { count: 0, delta: 0 }
  };
}
function asObjectCount(source) {
  const count = /^\s*(\d+)/.exec(source);
  const delta = /delta (\d+)/i.exec(source);
  return {
    count: asNumber(count && count[1] || "0"),
    delta: asNumber(delta && delta[1] || "0")
  };
}
var remoteMessagesObjectParsers;
var init_parse_remote_objects = __esm({
  "src/lib/parsers/parse-remote-objects.ts"() {
    "use strict";
    init_utils();
    remoteMessagesObjectParsers = [
      new RemoteLineParser(
        /^remote:\s*(enumerating|counting|compressing) objects: (\d+),/i,
        (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }
      ),
      new RemoteLineParser(
        /^remote:\s*(enumerating|counting|compressing) objects: \d+% \(\d+\/(\d+)\),/i,
        (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }
      ),
      new RemoteLineParser(
        /total ([^,]+), reused ([^,]+), pack-reused (\d+)/i,
        (result, [total, reused, packReused]) => {
          const objects = objectEnumerationResult(result.remoteMessages);
          objects.total = asObjectCount(total);
          objects.reused = asObjectCount(reused);
          objects.packReused = asNumber(packReused);
        }
      )
    ];
  }
});
function parseRemoteMessages(_stdOut, stdErr) {
  return parseStringResponse({ remoteMessages: new RemoteMessageSummary() }, parsers2, stdErr);
}
var parsers2;
var RemoteMessageSummary;
var init_parse_remote_messages = __esm({
  "src/lib/parsers/parse-remote-messages.ts"() {
    "use strict";
    init_utils();
    init_parse_remote_objects();
    parsers2 = [
      new RemoteLineParser(/^remote:\s*(.+)$/, (result, [text]) => {
        result.remoteMessages.all.push(text.trim());
        return false;
      }),
      ...remoteMessagesObjectParsers,
      new RemoteLineParser(
        [/create a (?:pull|merge) request/i, /\s(https?:\/\/\S+)$/],
        (result, [pullRequestUrl]) => {
          result.remoteMessages.pullRequestUrl = pullRequestUrl;
        }
      ),
      new RemoteLineParser(
        [/found (\d+) vulnerabilities.+\(([^)]+)\)/i, /\s(https?:\/\/\S+)$/],
        (result, [count, summary, url]) => {
          result.remoteMessages.vulnerabilities = {
            count: asNumber(count),
            summary,
            url
          };
        }
      )
    ];
    RemoteMessageSummary = class {
      constructor() {
        this.all = [];
      }
    };
  }
});
function parsePullErrorResult(stdOut, stdErr) {
  const pullError = parseStringResponse(new PullFailedSummary(), errorParsers, [stdOut, stdErr]);
  return pullError.message && pullError;
}
var FILE_UPDATE_REGEX;
var SUMMARY_REGEX;
var ACTION_REGEX;
var parsers3;
var errorParsers;
var parsePullDetail;
var parsePullResult;
var init_parse_pull = __esm({
  "src/lib/parsers/parse-pull.ts"() {
    "use strict";
    init_PullSummary();
    init_utils();
    init_parse_remote_messages();
    FILE_UPDATE_REGEX = /^\s*(.+?)\s+\|\s+\d+\s*(\+*)(-*)/;
    SUMMARY_REGEX = /(\d+)\D+((\d+)\D+\(\+\))?(\D+(\d+)\D+\(-\))?/;
    ACTION_REGEX = /^(create|delete) mode \d+ (.+)/;
    parsers3 = [
      new LineParser(FILE_UPDATE_REGEX, (result, [file, insertions, deletions]) => {
        result.files.push(file);
        if (insertions) {
          result.insertions[file] = insertions.length;
        }
        if (deletions) {
          result.deletions[file] = deletions.length;
        }
      }),
      new LineParser(SUMMARY_REGEX, (result, [changes, , insertions, , deletions]) => {
        if (insertions !== void 0 || deletions !== void 0) {
          result.summary.changes = +changes || 0;
          result.summary.insertions = +insertions || 0;
          result.summary.deletions = +deletions || 0;
          return true;
        }
        return false;
      }),
      new LineParser(ACTION_REGEX, (result, [action, file]) => {
        append(result.files, file);
        append(action === "create" ? result.created : result.deleted, file);
      })
    ];
    errorParsers = [
      new LineParser(/^from\s(.+)$/i, (result, [remote]) => void (result.remote = remote)),
      new LineParser(/^fatal:\s(.+)$/, (result, [message]) => void (result.message = message)),
      new LineParser(
        /([a-z0-9]+)\.\.([a-z0-9]+)\s+(\S+)\s+->\s+(\S+)$/,
        (result, [hashLocal, hashRemote, branchLocal, branchRemote]) => {
          result.branch.local = branchLocal;
          result.hash.local = hashLocal;
          result.branch.remote = branchRemote;
          result.hash.remote = hashRemote;
        }
      )
    ];
    parsePullDetail = (stdOut, stdErr) => {
      return parseStringResponse(new PullSummary(), parsers3, [stdOut, stdErr]);
    };
    parsePullResult = (stdOut, stdErr) => {
      return Object.assign(
        new PullSummary(),
        parsePullDetail(stdOut, stdErr),
        parseRemoteMessages(stdOut, stdErr)
      );
    };
  }
});
var parsers4;
var parseMergeResult;
var parseMergeDetail;
var init_parse_merge = __esm({
  "src/lib/parsers/parse-merge.ts"() {
    "use strict";
    init_MergeSummary();
    init_utils();
    init_parse_pull();
    parsers4 = [
      new LineParser(/^Auto-merging\s+(.+)$/, (summary, [autoMerge]) => {
        summary.merges.push(autoMerge);
      }),
      new LineParser(/^CONFLICT\s+\((.+)\): Merge conflict in (.+)$/, (summary, [reason, file]) => {
        summary.conflicts.push(new MergeSummaryConflict(reason, file));
      }),
      new LineParser(
        /^CONFLICT\s+\((.+\/delete)\): (.+) deleted in (.+) and/,
        (summary, [reason, file, deleteRef]) => {
          summary.conflicts.push(new MergeSummaryConflict(reason, file, { deleteRef }));
        }
      ),
      new LineParser(/^CONFLICT\s+\((.+)\):/, (summary, [reason]) => {
        summary.conflicts.push(new MergeSummaryConflict(reason, null));
      }),
      new LineParser(/^Automatic merge failed;\s+(.+)$/, (summary, [result]) => {
        summary.result = result;
      })
    ];
    parseMergeResult = (stdOut, stdErr) => {
      return Object.assign(parseMergeDetail(stdOut, stdErr), parsePullResult(stdOut, stdErr));
    };
    parseMergeDetail = (stdOut) => {
      return parseStringResponse(new MergeSummaryDetail(), parsers4, stdOut);
    };
  }
});
function mergeTask(customArgs) {
  if (!customArgs.length) {
    return configurationErrorTask("Git.merge requires at least one option");
  }
  return {
    commands: ["merge", ...customArgs],
    format: "utf-8",
    parser(stdOut, stdErr) {
      const merge2 = parseMergeResult(stdOut, stdErr);
      if (merge2.failed) {
        throw new GitResponseError(merge2);
      }
      return merge2;
    }
  };
}
var init_merge = __esm({
  "src/lib/tasks/merge.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_merge();
    init_task();
  }
});
function pushResultPushedItem(local, remote, status) {
  const deleted = status.includes("deleted");
  const tag = status.includes("tag") || /^refs\/tags/.test(local);
  const alreadyUpdated = !status.includes("new");
  return {
    deleted,
    tag,
    branch: !tag,
    new: !alreadyUpdated,
    alreadyUpdated,
    local,
    remote
  };
}
var parsers5;
var parsePushResult;
var parsePushDetail;
var init_parse_push = __esm({
  "src/lib/parsers/parse-push.ts"() {
    "use strict";
    init_utils();
    init_parse_remote_messages();
    parsers5 = [
      new LineParser(/^Pushing to (.+)$/, (result, [repo]) => {
        result.repo = repo;
      }),
      new LineParser(/^updating local tracking ref '(.+)'/, (result, [local]) => {
        result.ref = {
          ...result.ref || {},
          local
        };
      }),
      new LineParser(/^[=*-]\s+([^:]+):(\S+)\s+\[(.+)]$/, (result, [local, remote, type2]) => {
        result.pushed.push(pushResultPushedItem(local, remote, type2));
      }),
      new LineParser(
        /^Branch '([^']+)' set up to track remote branch '([^']+)' from '([^']+)'/,
        (result, [local, remote, remoteName]) => {
          result.branch = {
            ...result.branch || {},
            local,
            remote,
            remoteName
          };
        }
      ),
      new LineParser(
        /^([^:]+):(\S+)\s+([a-z0-9]+)\.\.([a-z0-9]+)$/,
        (result, [local, remote, from, to]) => {
          result.update = {
            head: {
              local,
              remote
            },
            hash: {
              from,
              to
            }
          };
        }
      )
    ];
    parsePushResult = (stdOut, stdErr) => {
      const pushDetail = parsePushDetail(stdOut, stdErr);
      const responseDetail = parseRemoteMessages(stdOut, stdErr);
      return {
        ...pushDetail,
        ...responseDetail
      };
    };
    parsePushDetail = (stdOut, stdErr) => {
      return parseStringResponse({ pushed: [] }, parsers5, [stdOut, stdErr]);
    };
  }
});
var push_exports = {};
__export(push_exports, {
  pushTagsTask: () => pushTagsTask,
  pushTask: () => pushTask
});
function pushTagsTask(ref = {}, customArgs) {
  append(customArgs, "--tags");
  return pushTask(ref, customArgs);
}
function pushTask(ref = {}, customArgs) {
  const commands = ["push", ...customArgs];
  if (ref.branch) {
    commands.splice(1, 0, ref.branch);
  }
  if (ref.remote) {
    commands.splice(1, 0, ref.remote);
  }
  remove(commands, "-v");
  append(commands, "--verbose");
  append(commands, "--porcelain");
  return {
    commands,
    format: "utf-8",
    parser: parsePushResult
  };
}
var init_push = __esm({
  "src/lib/tasks/push.ts"() {
    "use strict";
    init_parse_push();
    init_utils();
  }
});
function show_default() {
  return {
    showBuffer() {
      const commands = ["show", ...getTrailingOptions(arguments, 1)];
      if (!commands.includes("--binary")) {
        commands.splice(1, 0, "--binary");
      }
      return this._runTask(
        straightThroughBufferTask(commands),
        trailingFunctionArgument(arguments)
      );
    },
    show() {
      const commands = ["show", ...getTrailingOptions(arguments, 1)];
      return this._runTask(
        straightThroughStringTask(commands),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_show = __esm({
  "src/lib/tasks/show.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
var fromPathRegex;
var FileStatusSummary;
var init_FileStatusSummary = __esm({
  "src/lib/responses/FileStatusSummary.ts"() {
    "use strict";
    fromPathRegex = /^(.+)\0(.+)$/;
    FileStatusSummary = class {
      constructor(path10, index, working_dir) {
        this.path = path10;
        this.index = index;
        this.working_dir = working_dir;
        if (index === "R" || working_dir === "R") {
          const detail = fromPathRegex.exec(path10) || [null, path10, path10];
          this.from = detail[2] || "";
          this.path = detail[1] || "";
        }
      }
    };
  }
});
function renamedFile(line) {
  const [to, from] = line.split(NULL);
  return {
    from: from || to,
    to
  };
}
function parser3(indexX, indexY, handler) {
  return [`${indexX}${indexY}`, handler];
}
function conflicts(indexX, ...indexY) {
  return indexY.map((y) => parser3(indexX, y, (result, file) => append(result.conflicted, file)));
}
function splitLine(result, lineStr) {
  const trimmed2 = lineStr.trim();
  switch (" ") {
    case trimmed2.charAt(2):
      return data(trimmed2.charAt(0), trimmed2.charAt(1), trimmed2.substr(3));
    case trimmed2.charAt(1):
      return data(" ", trimmed2.charAt(0), trimmed2.substr(2));
    default:
      return;
  }
  function data(index, workingDir, path10) {
    const raw = `${index}${workingDir}`;
    const handler = parsers6.get(raw);
    if (handler) {
      handler(result, path10);
    }
    if (raw !== "##" && raw !== "!!") {
      result.files.push(new FileStatusSummary(path10, index, workingDir));
    }
  }
}
var StatusSummary;
var parsers6;
var parseStatusSummary;
var init_StatusSummary = __esm({
  "src/lib/responses/StatusSummary.ts"() {
    "use strict";
    init_utils();
    init_FileStatusSummary();
    StatusSummary = class {
      constructor() {
        this.not_added = [];
        this.conflicted = [];
        this.created = [];
        this.deleted = [];
        this.ignored = void 0;
        this.modified = [];
        this.renamed = [];
        this.files = [];
        this.staged = [];
        this.ahead = 0;
        this.behind = 0;
        this.current = null;
        this.tracking = null;
        this.detached = false;
        this.isClean = () => {
          return !this.files.length;
        };
      }
    };
    parsers6 = new Map([
      parser3(
        " ",
        "A",
        (result, file) => append(result.created, file)
      ),
      parser3(
        " ",
        "D",
        (result, file) => append(result.deleted, file)
      ),
      parser3(
        " ",
        "M",
        (result, file) => append(result.modified, file)
      ),
      parser3(
        "A",
        " ",
        (result, file) => append(result.created, file) && append(result.staged, file)
      ),
      parser3(
        "A",
        "M",
        (result, file) => append(result.created, file) && append(result.staged, file) && append(result.modified, file)
      ),
      parser3(
        "D",
        " ",
        (result, file) => append(result.deleted, file) && append(result.staged, file)
      ),
      parser3(
        "M",
        " ",
        (result, file) => append(result.modified, file) && append(result.staged, file)
      ),
      parser3(
        "M",
        "M",
        (result, file) => append(result.modified, file) && append(result.staged, file)
      ),
      parser3("R", " ", (result, file) => {
        append(result.renamed, renamedFile(file));
      }),
      parser3("R", "M", (result, file) => {
        const renamed2 = renamedFile(file);
        append(result.renamed, renamed2);
        append(result.modified, renamed2.to);
      }),
      parser3("!", "!", (_result, _file) => {
        append(_result.ignored = _result.ignored || [], _file);
      }),
      parser3(
        "?",
        "?",
        (result, file) => append(result.not_added, file)
      ),
      ...conflicts(
        "A",
        "A",
        "U"
        /* UNMERGED */
      ),
      ...conflicts(
        "D",
        "D",
        "U"
        /* UNMERGED */
      ),
      ...conflicts(
        "U",
        "A",
        "D",
        "U"
        /* UNMERGED */
      ),
      [
        "##",
        (result, line) => {
          const aheadReg = /ahead (\d+)/;
          const behindReg = /behind (\d+)/;
          const currentReg = /^(.+?(?=(?:\.{3}|\s|$)))/;
          const trackingReg = /\.{3}(\S*)/;
          const onEmptyBranchReg = /\son\s(\S+?)(?=\.{3}|$)/;
          let regexResult = aheadReg.exec(line);
          result.ahead = regexResult && +regexResult[1] || 0;
          regexResult = behindReg.exec(line);
          result.behind = regexResult && +regexResult[1] || 0;
          regexResult = currentReg.exec(line);
          result.current = filterType(regexResult?.[1], filterString, null);
          regexResult = trackingReg.exec(line);
          result.tracking = filterType(regexResult?.[1], filterString, null);
          regexResult = onEmptyBranchReg.exec(line);
          if (regexResult) {
            result.current = filterType(regexResult?.[1], filterString, result.current);
          }
          result.detached = /\(no branch\)/.test(line);
        }
      ]
    ]);
    parseStatusSummary = function(text) {
      const lines = text.split(NULL);
      const status = new StatusSummary();
      for (let i = 0, l = lines.length; i < l; ) {
        let line = lines[i++].trim();
        if (!line) {
          continue;
        }
        if (line.charAt(0) === "R") {
          line += NULL + (lines[i++] || "");
        }
        splitLine(status, line);
      }
      return status;
    };
  }
});
function statusTask(customArgs) {
  const commands = [
    "status",
    "--porcelain",
    "-b",
    "-u",
    "--null",
    ...customArgs.filter((arg) => !ignoredOptions.includes(arg))
  ];
  return {
    format: "utf-8",
    commands,
    parser(text) {
      return parseStatusSummary(text);
    }
  };
}
var ignoredOptions;
var init_status = __esm({
  "src/lib/tasks/status.ts"() {
    "use strict";
    init_StatusSummary();
    ignoredOptions = ["--null", "-z"];
  }
});
function versionResponse(major = 0, minor = 0, patch = 0, agent = "", installed = true) {
  return Object.defineProperty(
    {
      major,
      minor,
      patch,
      agent,
      installed
    },
    "toString",
    {
      value() {
        return `${this.major}.${this.minor}.${this.patch}`;
      },
      configurable: false,
      enumerable: false
    }
  );
}
function notInstalledResponse() {
  return versionResponse(0, 0, 0, "", false);
}
function version_default() {
  return {
    version() {
      return this._runTask({
        commands: ["--version"],
        format: "utf-8",
        parser: versionParser,
        onError(result, error, done, fail) {
          if (result.exitCode === -2) {
            return done(Buffer.from(NOT_INSTALLED));
          }
          fail(error);
        }
      });
    }
  };
}
function versionParser(stdOut) {
  if (stdOut === NOT_INSTALLED) {
    return notInstalledResponse();
  }
  return parseStringResponse(versionResponse(0, 0, 0, stdOut), parsers7, stdOut);
}
var NOT_INSTALLED;
var parsers7;
var init_version = __esm({
  "src/lib/tasks/version.ts"() {
    "use strict";
    init_utils();
    NOT_INSTALLED = "installed=false";
    parsers7 = [
      new LineParser(
        /version (\d+)\.(\d+)\.(\d+)(?:\s*\((.+)\))?/,
        (result, [major, minor, patch, agent = ""]) => {
          Object.assign(
            result,
            versionResponse(asNumber(major), asNumber(minor), asNumber(patch), agent)
          );
        }
      ),
      new LineParser(
        /version (\d+)\.(\d+)\.(\D+)(.+)?$/,
        (result, [major, minor, patch, agent = ""]) => {
          Object.assign(result, versionResponse(asNumber(major), asNumber(minor), patch, agent));
        }
      )
    ];
  }
});
var simple_git_api_exports = {};
__export(simple_git_api_exports, {
  SimpleGitApi: () => SimpleGitApi
});
var SimpleGitApi;
var init_simple_git_api = __esm({
  "src/lib/simple-git-api.ts"() {
    "use strict";
    init_task_callback();
    init_change_working_directory();
    init_checkout();
    init_count_objects();
    init_commit();
    init_config();
    init_first_commit();
    init_grep();
    init_hash_object();
    init_init();
    init_log();
    init_merge();
    init_push();
    init_show();
    init_status();
    init_task();
    init_version();
    init_utils();
    SimpleGitApi = class {
      constructor(_executor) {
        this._executor = _executor;
      }
      _runTask(task, then) {
        const chain = this._executor.chain();
        const promise = chain.push(task);
        if (then) {
          taskCallback(task, promise, then);
        }
        return Object.create(this, {
          then: { value: promise.then.bind(promise) },
          catch: { value: promise.catch.bind(promise) },
          _executor: { value: chain }
        });
      }
      add(files) {
        return this._runTask(
          straightThroughStringTask(["add", ...asArray(files)]),
          trailingFunctionArgument(arguments)
        );
      }
      cwd(directory) {
        const next = trailingFunctionArgument(arguments);
        if (typeof directory === "string") {
          return this._runTask(changeWorkingDirectoryTask(directory, this._executor), next);
        }
        if (typeof directory?.path === "string") {
          return this._runTask(
            changeWorkingDirectoryTask(
              directory.path,
              directory.root && this._executor || void 0
            ),
            next
          );
        }
        return this._runTask(
          configurationErrorTask("Git.cwd: workingDirectory must be supplied as a string"),
          next
        );
      }
      hashObject(path10, write) {
        return this._runTask(
          hashObjectTask(path10, write === true),
          trailingFunctionArgument(arguments)
        );
      }
      init(bare) {
        return this._runTask(
          initTask(bare === true, this._executor.cwd, getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
      merge() {
        return this._runTask(
          mergeTask(getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
      mergeFromTo(remote, branch) {
        if (!(filterString(remote) && filterString(branch))) {
          return this._runTask(
            configurationErrorTask(
              `Git.mergeFromTo requires that the 'remote' and 'branch' arguments are supplied as strings`
            )
          );
        }
        return this._runTask(
          mergeTask([remote, branch, ...getTrailingOptions(arguments)]),
          trailingFunctionArgument(arguments, false)
        );
      }
      outputHandler(handler) {
        this._executor.outputHandler = handler;
        return this;
      }
      push() {
        const task = pushTask(
          {
            remote: filterType(arguments[0], filterString),
            branch: filterType(arguments[1], filterString)
          },
          getTrailingOptions(arguments)
        );
        return this._runTask(task, trailingFunctionArgument(arguments));
      }
      stash() {
        return this._runTask(
          straightThroughStringTask(["stash", ...getTrailingOptions(arguments)]),
          trailingFunctionArgument(arguments)
        );
      }
      status() {
        return this._runTask(
          statusTask(getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
    };
    Object.assign(
      SimpleGitApi.prototype,
      checkout_default(),
      commit_default(),
      config_default(),
      count_objects_default(),
      first_commit_default(),
      grep_default(),
      log_default(),
      show_default(),
      version_default()
    );
  }
});
var scheduler_exports = {};
__export(scheduler_exports, {
  Scheduler: () => Scheduler
});
var createScheduledTask;
var Scheduler;
var init_scheduler = __esm({
  "src/lib/runners/scheduler.ts"() {
    "use strict";
    init_utils();
    init_git_logger();
    createScheduledTask = /* @__PURE__ */ (() => {
      let id = 0;
      return () => {
        id++;
        const { promise, done } = (0, import_promise_deferred.createDeferred)();
        return {
          promise,
          done,
          id
        };
      };
    })();
    Scheduler = class {
      constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.logger = createLogger("", "scheduler");
        this.pending = [];
        this.running = [];
        this.logger(`Constructed, concurrency=%s`, concurrency);
      }
      schedule() {
        if (!this.pending.length || this.running.length >= this.concurrency) {
          this.logger(
            `Schedule attempt ignored, pending=%s running=%s concurrency=%s`,
            this.pending.length,
            this.running.length,
            this.concurrency
          );
          return;
        }
        const task = append(this.running, this.pending.shift());
        this.logger(`Attempting id=%s`, task.id);
        task.done(() => {
          this.logger(`Completing id=`, task.id);
          remove(this.running, task);
          this.schedule();
        });
      }
      next() {
        const { promise, id } = append(this.pending, createScheduledTask());
        this.logger(`Scheduling id=%s`, id);
        this.schedule();
        return promise;
      }
    };
  }
});
var apply_patch_exports = {};
__export(apply_patch_exports, {
  applyPatchTask: () => applyPatchTask
});
function applyPatchTask(patches, customArgs) {
  return straightThroughStringTask(["apply", ...customArgs, ...patches]);
}
var init_apply_patch = __esm({
  "src/lib/tasks/apply-patch.ts"() {
    "use strict";
    init_task();
  }
});
function branchDeletionSuccess(branch, hash) {
  return {
    branch,
    hash,
    success: true
  };
}
function branchDeletionFailure(branch) {
  return {
    branch,
    hash: null,
    success: false
  };
}
var BranchDeletionBatch;
var init_BranchDeleteSummary = __esm({
  "src/lib/responses/BranchDeleteSummary.ts"() {
    "use strict";
    BranchDeletionBatch = class {
      constructor() {
        this.all = [];
        this.branches = {};
        this.errors = [];
      }
      get success() {
        return !this.errors.length;
      }
    };
  }
});
function hasBranchDeletionError(data, processExitCode) {
  return processExitCode === 1 && deleteErrorRegex.test(data);
}
var deleteSuccessRegex;
var deleteErrorRegex;
var parsers8;
var parseBranchDeletions;
var init_parse_branch_delete = __esm({
  "src/lib/parsers/parse-branch-delete.ts"() {
    "use strict";
    init_BranchDeleteSummary();
    init_utils();
    deleteSuccessRegex = /(\S+)\s+\(\S+\s([^)]+)\)/;
    deleteErrorRegex = /^error[^']+'([^']+)'/m;
    parsers8 = [
      new LineParser(deleteSuccessRegex, (result, [branch, hash]) => {
        const deletion = branchDeletionSuccess(branch, hash);
        result.all.push(deletion);
        result.branches[branch] = deletion;
      }),
      new LineParser(deleteErrorRegex, (result, [branch]) => {
        const deletion = branchDeletionFailure(branch);
        result.errors.push(deletion);
        result.all.push(deletion);
        result.branches[branch] = deletion;
      })
    ];
    parseBranchDeletions = (stdOut, stdErr) => {
      return parseStringResponse(new BranchDeletionBatch(), parsers8, [stdOut, stdErr]);
    };
  }
});
var BranchSummaryResult;
var init_BranchSummary = __esm({
  "src/lib/responses/BranchSummary.ts"() {
    "use strict";
    BranchSummaryResult = class {
      constructor() {
        this.all = [];
        this.branches = {};
        this.current = "";
        this.detached = false;
      }
      push(status, detached, name, commit, label) {
        if (status === "*") {
          this.detached = detached;
          this.current = name;
        }
        this.all.push(name);
        this.branches[name] = {
          current: status === "*",
          linkedWorkTree: status === "+",
          name,
          commit,
          label
        };
      }
    };
  }
});
function branchStatus(input) {
  return input ? input.charAt(0) : "";
}
function parseBranchSummary(stdOut, currentOnly = false) {
  return parseStringResponse(
    new BranchSummaryResult(),
    currentOnly ? [currentBranchParser] : parsers9,
    stdOut
  );
}
var parsers9;
var currentBranchParser;
var init_parse_branch = __esm({
  "src/lib/parsers/parse-branch.ts"() {
    "use strict";
    init_BranchSummary();
    init_utils();
    parsers9 = [
      new LineParser(
        /^([*+]\s)?\((?:HEAD )?detached (?:from|at) (\S+)\)\s+([a-z0-9]+)\s(.*)$/,
        (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), true, name, commit, label);
        }
      ),
      new LineParser(
        /^([*+]\s)?(\S+)\s+([a-z0-9]+)\s?(.*)$/s,
        (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), false, name, commit, label);
        }
      )
    ];
    currentBranchParser = new LineParser(/^(\S+)$/s, (result, [name]) => {
      result.push("*", false, name, "", "");
    });
  }
});
var branch_exports = {};
__export(branch_exports, {
  branchLocalTask: () => branchLocalTask,
  branchTask: () => branchTask,
  containsDeleteBranchCommand: () => containsDeleteBranchCommand,
  deleteBranchTask: () => deleteBranchTask,
  deleteBranchesTask: () => deleteBranchesTask
});
function containsDeleteBranchCommand(commands) {
  const deleteCommands = ["-d", "-D", "--delete"];
  return commands.some((command) => deleteCommands.includes(command));
}
function branchTask(customArgs) {
  const isDelete = containsDeleteBranchCommand(customArgs);
  const isCurrentOnly = customArgs.includes("--show-current");
  const commands = ["branch", ...customArgs];
  if (commands.length === 1) {
    commands.push("-a");
  }
  if (!commands.includes("-v")) {
    commands.splice(1, 0, "-v");
  }
  return {
    format: "utf-8",
    commands,
    parser(stdOut, stdErr) {
      if (isDelete) {
        return parseBranchDeletions(stdOut, stdErr).all[0];
      }
      return parseBranchSummary(stdOut, isCurrentOnly);
    }
  };
}
function branchLocalTask() {
  return {
    format: "utf-8",
    commands: ["branch", "-v"],
    parser(stdOut) {
      return parseBranchSummary(stdOut);
    }
  };
}
function deleteBranchesTask(branches, forceDelete = false) {
  return {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", ...branches],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr);
    },
    onError({ exitCode, stdOut }, error, done, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      done(stdOut);
    }
  };
}
function deleteBranchTask(branch, forceDelete = false) {
  const task = {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", branch],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr).branches[branch];
    },
    onError({ exitCode, stdErr, stdOut }, error, _, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      throw new GitResponseError(
        task.parser(bufferToString(stdOut), bufferToString(stdErr)),
        String(error)
      );
    }
  };
  return task;
}
var init_branch = __esm({
  "src/lib/tasks/branch.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_branch_delete();
    init_parse_branch();
    init_utils();
  }
});
function toPath(input) {
  const path10 = input.trim().replace(/^["']|["']$/g, "");
  return path10 && (0, import_node_path.normalize)(path10);
}
var parseCheckIgnore;
var init_CheckIgnore = __esm({
  "src/lib/responses/CheckIgnore.ts"() {
    "use strict";
    parseCheckIgnore = (text) => {
      return text.split(/\n/g).map(toPath).filter(Boolean);
    };
  }
});
var check_ignore_exports = {};
__export(check_ignore_exports, {
  checkIgnoreTask: () => checkIgnoreTask
});
function checkIgnoreTask(paths) {
  return {
    commands: ["check-ignore", ...paths],
    format: "utf-8",
    parser: parseCheckIgnore
  };
}
var init_check_ignore = __esm({
  "src/lib/tasks/check-ignore.ts"() {
    "use strict";
    init_CheckIgnore();
  }
});
var clone_exports = {};
__export(clone_exports, {
  cloneMirrorTask: () => cloneMirrorTask,
  cloneTask: () => cloneTask
});
function disallowedCommand(command) {
  return /^--upload-pack(=|$)/.test(command);
}
function cloneTask(repo, directory, customArgs) {
  const commands = ["clone", ...customArgs];
  filterString(repo) && commands.push(repo);
  filterString(directory) && commands.push(directory);
  const banned = commands.find(disallowedCommand);
  if (banned) {
    return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
  }
  return straightThroughStringTask(commands);
}
function cloneMirrorTask(repo, directory, customArgs) {
  append(customArgs, "--mirror");
  return cloneTask(repo, directory, customArgs);
}
var init_clone = __esm({
  "src/lib/tasks/clone.ts"() {
    "use strict";
    init_task();
    init_utils();
  }
});
function parseFetchResult(stdOut, stdErr) {
  const result = {
    raw: stdOut,
    remote: null,
    branches: [],
    tags: [],
    updated: [],
    deleted: []
  };
  return parseStringResponse(result, parsers10, [stdOut, stdErr]);
}
var parsers10;
var init_parse_fetch = __esm({
  "src/lib/parsers/parse-fetch.ts"() {
    "use strict";
    init_utils();
    parsers10 = [
      new LineParser(/From (.+)$/, (result, [remote]) => {
        result.remote = remote;
      }),
      new LineParser(/\* \[new branch]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
        result.branches.push({
          name,
          tracking
        });
      }),
      new LineParser(/\* \[new tag]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
        result.tags.push({
          name,
          tracking
        });
      }),
      new LineParser(/- \[deleted]\s+\S+\s*-> (.+)$/, (result, [tracking]) => {
        result.deleted.push({
          tracking
        });
      }),
      new LineParser(
        /\s*([^.]+)\.\.(\S+)\s+(\S+)\s*-> (.+)$/,
        (result, [from, to, name, tracking]) => {
          result.updated.push({
            name,
            tracking,
            to,
            from
          });
        }
      )
    ];
  }
});
var fetch_exports = {};
__export(fetch_exports, {
  fetchTask: () => fetchTask
});
function disallowedCommand2(command) {
  return /^--upload-pack(=|$)/.test(command);
}
function fetchTask(remote, branch, customArgs) {
  const commands = ["fetch", ...customArgs];
  if (remote && branch) {
    commands.push(remote, branch);
  }
  const banned = commands.find(disallowedCommand2);
  if (banned) {
    return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
  }
  return {
    commands,
    format: "utf-8",
    parser: parseFetchResult
  };
}
var init_fetch = __esm({
  "src/lib/tasks/fetch.ts"() {
    "use strict";
    init_parse_fetch();
    init_task();
  }
});
function parseMoveResult(stdOut) {
  return parseStringResponse({ moves: [] }, parsers11, stdOut);
}
var parsers11;
var init_parse_move = __esm({
  "src/lib/parsers/parse-move.ts"() {
    "use strict";
    init_utils();
    parsers11 = [
      new LineParser(/^Renaming (.+) to (.+)$/, (result, [from, to]) => {
        result.moves.push({ from, to });
      })
    ];
  }
});
var move_exports = {};
__export(move_exports, {
  moveTask: () => moveTask
});
function moveTask(from, to) {
  return {
    commands: ["mv", "-v", ...asArray(from), to],
    format: "utf-8",
    parser: parseMoveResult
  };
}
var init_move = __esm({
  "src/lib/tasks/move.ts"() {
    "use strict";
    init_parse_move();
    init_utils();
  }
});
var pull_exports = {};
__export(pull_exports, {
  pullTask: () => pullTask
});
function pullTask(remote, branch, customArgs) {
  const commands = ["pull", ...customArgs];
  if (remote && branch) {
    commands.splice(1, 0, remote, branch);
  }
  return {
    commands,
    format: "utf-8",
    parser(stdOut, stdErr) {
      return parsePullResult(stdOut, stdErr);
    },
    onError(result, _error, _done, fail) {
      const pullError = parsePullErrorResult(
        bufferToString(result.stdOut),
        bufferToString(result.stdErr)
      );
      if (pullError) {
        return fail(new GitResponseError(pullError));
      }
      fail(_error);
    }
  };
}
var init_pull = __esm({
  "src/lib/tasks/pull.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_pull();
    init_utils();
  }
});
function parseGetRemotes(text) {
  const remotes = {};
  forEach(text, ([name]) => remotes[name] = { name });
  return Object.values(remotes);
}
function parseGetRemotesVerbose(text) {
  const remotes = {};
  forEach(text, ([name, url, purpose]) => {
    if (!Object.hasOwn(remotes, name)) {
      remotes[name] = {
        name,
        refs: { fetch: "", push: "" }
      };
    }
    if (purpose && url) {
      remotes[name].refs[purpose.replace(/[^a-z]/g, "")] = url;
    }
  });
  return Object.values(remotes);
}
function forEach(text, handler) {
  forEachLineWithContent(text, (line) => handler(line.split(/\s+/)));
}
var init_GetRemoteSummary = __esm({
  "src/lib/responses/GetRemoteSummary.ts"() {
    "use strict";
    init_utils();
  }
});
var remote_exports = {};
__export(remote_exports, {
  addRemoteTask: () => addRemoteTask,
  getRemotesTask: () => getRemotesTask,
  listRemotesTask: () => listRemotesTask,
  remoteTask: () => remoteTask,
  removeRemoteTask: () => removeRemoteTask
});
function addRemoteTask(remoteName, remoteRepo, customArgs) {
  return straightThroughStringTask(["remote", "add", ...customArgs, remoteName, remoteRepo]);
}
function getRemotesTask(verbose) {
  const commands = ["remote"];
  if (verbose) {
    commands.push("-v");
  }
  return {
    commands,
    format: "utf-8",
    parser: verbose ? parseGetRemotesVerbose : parseGetRemotes
  };
}
function listRemotesTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "ls-remote") {
    commands.unshift("ls-remote");
  }
  return straightThroughStringTask(commands);
}
function remoteTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "remote") {
    commands.unshift("remote");
  }
  return straightThroughStringTask(commands);
}
function removeRemoteTask(remoteName) {
  return straightThroughStringTask(["remote", "remove", remoteName]);
}
var init_remote = __esm({
  "src/lib/tasks/remote.ts"() {
    "use strict";
    init_GetRemoteSummary();
    init_task();
  }
});
var stash_list_exports = {};
__export(stash_list_exports, {
  stashListTask: () => stashListTask
});
function stashListTask(opt = {}, customArgs) {
  const options = parseLogOptions(opt);
  const commands = ["stash", "list", ...options.commands, ...customArgs];
  const parser4 = createListLogSummaryParser(
    options.splitter,
    options.fields,
    logFormatFromCommand(commands)
  );
  return validateLogFormatConfig(commands) || {
    commands,
    format: "utf-8",
    parser: parser4
  };
}
var init_stash_list = __esm({
  "src/lib/tasks/stash-list.ts"() {
    "use strict";
    init_log_format();
    init_parse_list_log_summary();
    init_diff();
    init_log();
  }
});
var sub_module_exports = {};
__export(sub_module_exports, {
  addSubModuleTask: () => addSubModuleTask,
  initSubModuleTask: () => initSubModuleTask,
  subModuleTask: () => subModuleTask,
  updateSubModuleTask: () => updateSubModuleTask
});
function addSubModuleTask(repo, path10) {
  return subModuleTask(["add", repo, path10]);
}
function initSubModuleTask(customArgs) {
  return subModuleTask(["init", ...customArgs]);
}
function subModuleTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "submodule") {
    commands.unshift("submodule");
  }
  return straightThroughStringTask(commands);
}
function updateSubModuleTask(customArgs) {
  return subModuleTask(["update", ...customArgs]);
}
var init_sub_module = __esm({
  "src/lib/tasks/sub-module.ts"() {
    "use strict";
    init_task();
  }
});
function singleSorted(a, b) {
  const aIsNum = Number.isNaN(a);
  const bIsNum = Number.isNaN(b);
  if (aIsNum !== bIsNum) {
    return aIsNum ? 1 : -1;
  }
  return aIsNum ? sorted(a, b) : 0;
}
function sorted(a, b) {
  return a === b ? 0 : a > b ? 1 : -1;
}
function trimmed(input) {
  return input.trim();
}
function toNumber(input) {
  if (typeof input === "string") {
    return parseInt(input.replace(/^\D+/g, ""), 10) || 0;
  }
  return 0;
}
var TagList;
var parseTagList;
var init_TagList = __esm({
  "src/lib/responses/TagList.ts"() {
    "use strict";
    TagList = class {
      constructor(all, latest) {
        this.all = all;
        this.latest = latest;
      }
    };
    parseTagList = function(data, customSort = false) {
      const tags = data.split("\n").map(trimmed).filter(Boolean);
      if (!customSort) {
        tags.sort(function(tagA, tagB) {
          const partsA = tagA.split(".");
          const partsB = tagB.split(".");
          if (partsA.length === 1 || partsB.length === 1) {
            return singleSorted(toNumber(partsA[0]), toNumber(partsB[0]));
          }
          for (let i = 0, l = Math.max(partsA.length, partsB.length); i < l; i++) {
            const diff = sorted(toNumber(partsA[i]), toNumber(partsB[i]));
            if (diff) {
              return diff;
            }
          }
          return 0;
        });
      }
      const latest = customSort ? tags[0] : [...tags].reverse().find((tag) => tag.indexOf(".") >= 0);
      return new TagList(tags, latest);
    };
  }
});
var tag_exports = {};
__export(tag_exports, {
  addAnnotatedTagTask: () => addAnnotatedTagTask,
  addTagTask: () => addTagTask,
  tagListTask: () => tagListTask
});
function tagListTask(customArgs = []) {
  const hasCustomSort = customArgs.some((option) => /^--sort=/.test(option));
  return {
    format: "utf-8",
    commands: ["tag", "-l", ...customArgs],
    parser(text) {
      return parseTagList(text, hasCustomSort);
    }
  };
}
function addTagTask(name) {
  return {
    format: "utf-8",
    commands: ["tag", name],
    parser() {
      return { name };
    }
  };
}
function addAnnotatedTagTask(name, tagMessage) {
  return {
    format: "utf-8",
    commands: ["tag", "-a", "-m", tagMessage, name],
    parser() {
      return { name };
    }
  };
}
var init_tag = __esm({
  "src/lib/tasks/tag.ts"() {
    "use strict";
    init_TagList();
  }
});
var require_git = __commonJS2({
  "src/git.js"(exports2, module2) {
    "use strict";
    var { GitExecutor: GitExecutor2 } = (init_git_executor(), __toCommonJS(git_executor_exports));
    var { SimpleGitApi: SimpleGitApi2 } = (init_simple_git_api(), __toCommonJS(simple_git_api_exports));
    var { Scheduler: Scheduler2 } = (init_scheduler(), __toCommonJS(scheduler_exports));
    var { configurationErrorTask: configurationErrorTask2 } = (init_task(), __toCommonJS(task_exports));
    var {
      asArray: asArray2,
      filterArray: filterArray2,
      filterPrimitives: filterPrimitives2,
      filterString: filterString2,
      filterStringOrStringArray: filterStringOrStringArray2,
      filterType: filterType2,
      getTrailingOptions: getTrailingOptions2,
      trailingFunctionArgument: trailingFunctionArgument2,
      trailingOptionsArgument: trailingOptionsArgument2
    } = (init_utils(), __toCommonJS(utils_exports));
    var { applyPatchTask: applyPatchTask2 } = (init_apply_patch(), __toCommonJS(apply_patch_exports));
    var {
      branchTask: branchTask2,
      branchLocalTask: branchLocalTask2,
      deleteBranchesTask: deleteBranchesTask2,
      deleteBranchTask: deleteBranchTask2
    } = (init_branch(), __toCommonJS(branch_exports));
    var { checkIgnoreTask: checkIgnoreTask2 } = (init_check_ignore(), __toCommonJS(check_ignore_exports));
    var { checkIsRepoTask: checkIsRepoTask2 } = (init_check_is_repo(), __toCommonJS(check_is_repo_exports));
    var { cloneTask: cloneTask2, cloneMirrorTask: cloneMirrorTask2 } = (init_clone(), __toCommonJS(clone_exports));
    var { cleanWithOptionsTask: cleanWithOptionsTask2, isCleanOptionsArray: isCleanOptionsArray2 } = (init_clean(), __toCommonJS(clean_exports));
    var { diffSummaryTask: diffSummaryTask2 } = (init_diff(), __toCommonJS(diff_exports));
    var { fetchTask: fetchTask2 } = (init_fetch(), __toCommonJS(fetch_exports));
    var { moveTask: moveTask2 } = (init_move(), __toCommonJS(move_exports));
    var { pullTask: pullTask2 } = (init_pull(), __toCommonJS(pull_exports));
    var { pushTagsTask: pushTagsTask2 } = (init_push(), __toCommonJS(push_exports));
    var {
      addRemoteTask: addRemoteTask2,
      getRemotesTask: getRemotesTask2,
      listRemotesTask: listRemotesTask2,
      remoteTask: remoteTask2,
      removeRemoteTask: removeRemoteTask2
    } = (init_remote(), __toCommonJS(remote_exports));
    var { getResetMode: getResetMode2, resetTask: resetTask2 } = (init_reset(), __toCommonJS(reset_exports));
    var { stashListTask: stashListTask2 } = (init_stash_list(), __toCommonJS(stash_list_exports));
    var {
      addSubModuleTask: addSubModuleTask2,
      initSubModuleTask: initSubModuleTask2,
      subModuleTask: subModuleTask2,
      updateSubModuleTask: updateSubModuleTask2
    } = (init_sub_module(), __toCommonJS(sub_module_exports));
    var { addAnnotatedTagTask: addAnnotatedTagTask2, addTagTask: addTagTask2, tagListTask: tagListTask2 } = (init_tag(), __toCommonJS(tag_exports));
    var { straightThroughBufferTask: straightThroughBufferTask2, straightThroughStringTask: straightThroughStringTask2 } = (init_task(), __toCommonJS(task_exports));
    function Git2(options, plugins) {
      this._plugins = plugins;
      this._executor = new GitExecutor2(
        options.baseDir,
        new Scheduler2(options.maxConcurrentProcesses),
        plugins
      );
      this._trimmed = options.trimmed;
    }
    (Git2.prototype = Object.create(SimpleGitApi2.prototype)).constructor = Git2;
    Git2.prototype.customBinary = function(command) {
      this._plugins.reconfigure("binary", command);
      return this;
    };
    Git2.prototype.env = function(name, value) {
      if (arguments.length === 1 && typeof name === "object") {
        this._executor.env = name;
      } else {
        (this._executor.env = this._executor.env || {})[name] = value;
      }
      return this;
    };
    Git2.prototype.stashList = function(options) {
      return this._runTask(
        stashListTask2(
          trailingOptionsArgument2(arguments) || {},
          filterArray2(options) && options || []
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    function createCloneTask(api, task, repoPath, localPath) {
      if (typeof repoPath !== "string") {
        return configurationErrorTask2(`git.${api}() requires a string 'repoPath'`);
      }
      return task(repoPath, filterType2(localPath, filterString2), getTrailingOptions2(arguments));
    }
    Git2.prototype.clone = function() {
      return this._runTask(
        createCloneTask("clone", cloneTask2, ...arguments),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.mirror = function() {
      return this._runTask(
        createCloneTask("mirror", cloneMirrorTask2, ...arguments),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.mv = function(from, to) {
      return this._runTask(moveTask2(from, to), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.checkoutLatestTag = function(then) {
      var git = this;
      return this.pull(function() {
        git.tags(function(err, tags) {
          git.checkout(tags.latest, then);
        });
      });
    };
    Git2.prototype.pull = function(remote, branch, options, then) {
      return this._runTask(
        pullTask2(
          filterType2(remote, filterString2),
          filterType2(branch, filterString2),
          getTrailingOptions2(arguments)
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.fetch = function(remote, branch) {
      return this._runTask(
        fetchTask2(
          filterType2(remote, filterString2),
          filterType2(branch, filterString2),
          getTrailingOptions2(arguments)
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.silent = function(silence) {
      console.warn(
        "simple-git deprecation notice: git.silent: logging should be configured using the `debug` library / `DEBUG` environment variable, this will be an error in version 3"
      );
      return this;
    };
    Git2.prototype.tags = function(options, then) {
      return this._runTask(
        tagListTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.rebase = function() {
      return this._runTask(
        straightThroughStringTask2(["rebase", ...getTrailingOptions2(arguments)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.reset = function(mode) {
      return this._runTask(
        resetTask2(getResetMode2(mode), getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.revert = function(commit) {
      const next = trailingFunctionArgument2(arguments);
      if (typeof commit !== "string") {
        return this._runTask(configurationErrorTask2("Commit must be a string"), next);
      }
      return this._runTask(
        straightThroughStringTask2(["revert", ...getTrailingOptions2(arguments, 0, true), commit]),
        next
      );
    };
    Git2.prototype.addTag = function(name) {
      const task = typeof name === "string" ? addTagTask2(name) : configurationErrorTask2("Git.addTag requires a tag name");
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.addAnnotatedTag = function(tagName, tagMessage) {
      return this._runTask(
        addAnnotatedTagTask2(tagName, tagMessage),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.deleteLocalBranch = function(branchName, forceDelete, then) {
      return this._runTask(
        deleteBranchTask2(branchName, typeof forceDelete === "boolean" ? forceDelete : false),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.deleteLocalBranches = function(branchNames, forceDelete, then) {
      return this._runTask(
        deleteBranchesTask2(branchNames, typeof forceDelete === "boolean" ? forceDelete : false),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.branch = function(options, then) {
      return this._runTask(
        branchTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.branchLocal = function(then) {
      return this._runTask(branchLocalTask2(), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.raw = function(commands) {
      const createRestCommands = !Array.isArray(commands);
      const command = [].slice.call(createRestCommands ? arguments : commands, 0);
      for (let i = 0; i < command.length && createRestCommands; i++) {
        if (!filterPrimitives2(command[i])) {
          command.splice(i, command.length - i);
          break;
        }
      }
      command.push(...getTrailingOptions2(arguments, 0, true));
      var next = trailingFunctionArgument2(arguments);
      if (!command.length) {
        return this._runTask(
          configurationErrorTask2("Raw: must supply one or more command to execute"),
          next
        );
      }
      return this._runTask(straightThroughStringTask2(command, this._trimmed), next);
    };
    Git2.prototype.submoduleAdd = function(repo, path10, then) {
      return this._runTask(addSubModuleTask2(repo, path10), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.submoduleUpdate = function(args, then) {
      return this._runTask(
        updateSubModuleTask2(getTrailingOptions2(arguments, true)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.submoduleInit = function(args, then) {
      return this._runTask(
        initSubModuleTask2(getTrailingOptions2(arguments, true)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.subModule = function(options, then) {
      return this._runTask(
        subModuleTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.listRemote = function() {
      return this._runTask(
        listRemotesTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.addRemote = function(remoteName, remoteRepo, then) {
      return this._runTask(
        addRemoteTask2(remoteName, remoteRepo, getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.removeRemote = function(remoteName, then) {
      return this._runTask(removeRemoteTask2(remoteName), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.getRemotes = function(verbose, then) {
      return this._runTask(getRemotesTask2(verbose === true), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.remote = function(options, then) {
      return this._runTask(
        remoteTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.tag = function(options, then) {
      const command = getTrailingOptions2(arguments);
      if (command[0] !== "tag") {
        command.unshift("tag");
      }
      return this._runTask(straightThroughStringTask2(command), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.updateServerInfo = function(then) {
      return this._runTask(
        straightThroughStringTask2(["update-server-info"]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.pushTags = function(remote, then) {
      const task = pushTagsTask2(
        { remote: filterType2(remote, filterString2) },
        getTrailingOptions2(arguments)
      );
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.rm = function(files) {
      return this._runTask(
        straightThroughStringTask2(["rm", "-f", ...asArray2(files)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.rmKeepLocal = function(files) {
      return this._runTask(
        straightThroughStringTask2(["rm", "--cached", ...asArray2(files)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.catFile = function(options, then) {
      return this._catFile("utf-8", arguments);
    };
    Git2.prototype.binaryCatFile = function() {
      return this._catFile("buffer", arguments);
    };
    Git2.prototype._catFile = function(format, args) {
      var handler = trailingFunctionArgument2(args);
      var command = ["cat-file"];
      var options = args[0];
      if (typeof options === "string") {
        return this._runTask(
          configurationErrorTask2("Git.catFile: options must be supplied as an array of strings"),
          handler
        );
      }
      if (Array.isArray(options)) {
        command.push.apply(command, options);
      }
      const task = format === "buffer" ? straightThroughBufferTask2(command) : straightThroughStringTask2(command);
      return this._runTask(task, handler);
    };
    Git2.prototype.diff = function(options, then) {
      const task = filterString2(options) ? configurationErrorTask2(
        "git.diff: supplying options as a single string is no longer supported, switch to an array of strings"
      ) : straightThroughStringTask2(["diff", ...getTrailingOptions2(arguments)]);
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.diffSummary = function() {
      return this._runTask(
        diffSummaryTask2(getTrailingOptions2(arguments, 1)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.applyPatch = function(patches) {
      const task = !filterStringOrStringArray2(patches) ? configurationErrorTask2(
        `git.applyPatch requires one or more string patches as the first argument`
      ) : applyPatchTask2(asArray2(patches), getTrailingOptions2([].slice.call(arguments, 1)));
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.revparse = function() {
      const commands = ["rev-parse", ...getTrailingOptions2(arguments, true)];
      return this._runTask(
        straightThroughStringTask2(commands, true),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.clean = function(mode, options, then) {
      const usingCleanOptionsArray = isCleanOptionsArray2(mode);
      const cleanMode = usingCleanOptionsArray && mode.join("") || filterType2(mode, filterString2) || "";
      const customArgs = getTrailingOptions2([].slice.call(arguments, usingCleanOptionsArray ? 1 : 0));
      return this._runTask(
        cleanWithOptionsTask2(cleanMode, customArgs),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.exec = function(then) {
      const task = {
        commands: [],
        format: "utf-8",
        parser() {
          if (typeof then === "function") {
            then();
          }
        }
      };
      return this._runTask(task);
    };
    Git2.prototype.clearQueue = function() {
      return this;
    };
    Git2.prototype.checkIgnore = function(pathnames, then) {
      return this._runTask(
        checkIgnoreTask2(asArray2(filterType2(pathnames, filterStringOrStringArray2, []))),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.checkIsRepo = function(checkType, then) {
      return this._runTask(
        checkIsRepoTask2(filterType2(checkType, filterString2)),
        trailingFunctionArgument2(arguments)
      );
    };
    module2.exports = Git2;
  }
});
init_pathspec();
init_git_error();
var GitConstructError = class extends GitError {
  constructor(config, message) {
    super(void 0, message);
    this.config = config;
  }
};
init_git_error();
init_git_error();
var GitPluginError = class extends GitError {
  constructor(task, plugin, message) {
    super(task, message);
    this.task = task;
    this.plugin = plugin;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
init_git_response_error();
init_task_configuration_error();
init_check_is_repo();
init_clean();
init_config();
init_diff_name_status();
init_grep();
init_reset();
function abortPlugin(signal) {
  if (!signal) {
    return;
  }
  const onSpawnAfter = {
    type: "spawn.after",
    action(_data, context) {
      function kill() {
        context.kill(new GitPluginError(void 0, "abort", "Abort signal received"));
      }
      signal.addEventListener("abort", kill);
      context.spawned.on("close", () => signal.removeEventListener("abort", kill));
    }
  };
  const onSpawnBefore = {
    type: "spawn.before",
    action(_data, context) {
      if (signal.aborted) {
        context.kill(new GitPluginError(void 0, "abort", "Abort already signaled"));
      }
    }
  };
  return [onSpawnBefore, onSpawnAfter];
}
function isConfigSwitch(arg) {
  return typeof arg === "string" && arg.trim().toLowerCase() === "-c";
}
function preventProtocolOverride(arg, next) {
  if (!isConfigSwitch(arg)) {
    return;
  }
  if (!/^\s*protocol(.[a-z]+)?.allow/.test(next)) {
    return;
  }
  throw new GitPluginError(
    void 0,
    "unsafe",
    "Configuring protocol.allow is not permitted without enabling allowUnsafeExtProtocol"
  );
}
function preventUploadPack(arg, method) {
  if (/^\s*--(upload|receive)-pack/.test(arg)) {
    throw new GitPluginError(
      void 0,
      "unsafe",
      `Use of --upload-pack or --receive-pack is not permitted without enabling allowUnsafePack`
    );
  }
  if (method === "clone" && /^\s*-u\b/.test(arg)) {
    throw new GitPluginError(
      void 0,
      "unsafe",
      `Use of clone with option -u is not permitted without enabling allowUnsafePack`
    );
  }
  if (method === "push" && /^\s*--exec\b/.test(arg)) {
    throw new GitPluginError(
      void 0,
      "unsafe",
      `Use of push with option --exec is not permitted without enabling allowUnsafePack`
    );
  }
}
function blockUnsafeOperationsPlugin({
  allowUnsafeProtocolOverride = false,
  allowUnsafePack = false
} = {}) {
  return {
    type: "spawn.args",
    action(args, context) {
      args.forEach((current, index) => {
        const next = index < args.length ? args[index + 1] : "";
        allowUnsafeProtocolOverride || preventProtocolOverride(current, next);
        allowUnsafePack || preventUploadPack(current, context.method);
      });
      return args;
    }
  };
}
init_utils();
function commandConfigPrefixingPlugin(configuration) {
  const prefix = prefixedArray(configuration, "-c");
  return {
    type: "spawn.args",
    action(data) {
      return [...prefix, ...data];
    }
  };
}
init_utils();
var never = (0, import_promise_deferred2.deferred)().promise;
function completionDetectionPlugin({
  onClose = true,
  onExit = 50
} = {}) {
  function createEvents() {
    let exitCode = -1;
    const events = {
      close: (0, import_promise_deferred2.deferred)(),
      closeTimeout: (0, import_promise_deferred2.deferred)(),
      exit: (0, import_promise_deferred2.deferred)(),
      exitTimeout: (0, import_promise_deferred2.deferred)()
    };
    const result = Promise.race([
      onClose === false ? never : events.closeTimeout.promise,
      onExit === false ? never : events.exitTimeout.promise
    ]);
    configureTimeout(onClose, events.close, events.closeTimeout);
    configureTimeout(onExit, events.exit, events.exitTimeout);
    return {
      close(code) {
        exitCode = code;
        events.close.done();
      },
      exit(code) {
        exitCode = code;
        events.exit.done();
      },
      get exitCode() {
        return exitCode;
      },
      result
    };
  }
  function configureTimeout(flag, event, timeout) {
    if (flag === false) {
      return;
    }
    (flag === true ? event.promise : event.promise.then(() => delay(flag))).then(timeout.done);
  }
  return {
    type: "spawn.after",
    async action(_data, { spawned, close }) {
      const events = createEvents();
      let deferClose = true;
      let quickClose = () => void (deferClose = false);
      spawned.stdout?.on("data", quickClose);
      spawned.stderr?.on("data", quickClose);
      spawned.on("error", quickClose);
      spawned.on("close", (code) => events.close(code));
      spawned.on("exit", (code) => events.exit(code));
      try {
        await events.result;
        if (deferClose) {
          await delay(50);
        }
        close(events.exitCode);
      } catch (err) {
        close(events.exitCode, err);
      }
    }
  };
}
init_utils();
var WRONG_NUMBER_ERR = `Invalid value supplied for custom binary, requires a single string or an array containing either one or two strings`;
var WRONG_CHARS_ERR = `Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option`;
function isBadArgument(arg) {
  return !arg || !/^([a-z]:)?([a-z0-9/.\\_-]+)$/i.test(arg);
}
function toBinaryConfig(input, allowUnsafe) {
  if (input.length < 1 || input.length > 2) {
    throw new GitPluginError(void 0, "binary", WRONG_NUMBER_ERR);
  }
  const isBad = input.some(isBadArgument);
  if (isBad) {
    if (allowUnsafe) {
      console.warn(WRONG_CHARS_ERR);
    } else {
      throw new GitPluginError(void 0, "binary", WRONG_CHARS_ERR);
    }
  }
  const [binary2, prefix] = input;
  return {
    binary: binary2,
    prefix
  };
}
function customBinaryPlugin(plugins, input = ["git"], allowUnsafe = false) {
  let config = toBinaryConfig(asArray(input), allowUnsafe);
  plugins.on("binary", (input2) => {
    config = toBinaryConfig(asArray(input2), allowUnsafe);
  });
  plugins.append("spawn.binary", () => {
    return config.binary;
  });
  plugins.append("spawn.args", (data) => {
    return config.prefix ? [config.prefix, ...data] : data;
  });
}
init_git_error();
function isTaskError(result) {
  return !!(result.exitCode && result.stdErr.length);
}
function getErrorMessage(result) {
  return Buffer.concat([...result.stdOut, ...result.stdErr]);
}
function errorDetectionHandler(overwrite = false, isError = isTaskError, errorMessage = getErrorMessage) {
  return (error, result) => {
    if (!overwrite && error || !isError(result)) {
      return error;
    }
    return errorMessage(result);
  };
}
function errorDetectionPlugin(config) {
  return {
    type: "task.error",
    action(data, context) {
      const error = config(data.error, {
        stdErr: context.stdErr,
        stdOut: context.stdOut,
        exitCode: context.exitCode
      });
      if (Buffer.isBuffer(error)) {
        return { error: new GitError(void 0, error.toString("utf-8")) };
      }
      return {
        error
      };
    }
  };
}
init_utils();
var PluginStore = class {
  constructor() {
    this.plugins = /* @__PURE__ */ new Set();
    this.events = new import_node_events.EventEmitter();
  }
  on(type2, listener) {
    this.events.on(type2, listener);
  }
  reconfigure(type2, data) {
    this.events.emit(type2, data);
  }
  append(type2, action) {
    const plugin = append(this.plugins, { type: type2, action });
    return () => this.plugins.delete(plugin);
  }
  add(plugin) {
    const plugins = [];
    asArray(plugin).forEach((plugin2) => plugin2 && this.plugins.add(append(plugins, plugin2)));
    return () => {
      plugins.forEach((plugin2) => this.plugins.delete(plugin2));
    };
  }
  exec(type2, data, context) {
    let output = data;
    const contextual = Object.freeze(Object.create(context));
    for (const plugin of this.plugins) {
      if (plugin.type === type2) {
        output = plugin.action(output, contextual);
      }
    }
    return output;
  }
};
init_utils();
function progressMonitorPlugin(progress) {
  const progressCommand = "--progress";
  const progressMethods = ["checkout", "clone", "fetch", "pull", "push"];
  const onProgress = {
    type: "spawn.after",
    action(_data, context) {
      if (!context.commands.includes(progressCommand)) {
        return;
      }
      context.spawned.stderr?.on("data", (chunk) => {
        const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString("utf8"));
        if (!message) {
          return;
        }
        progress({
          method: context.method,
          stage: progressEventStage(message[1]),
          progress: asNumber(message[2]),
          processed: asNumber(message[3]),
          total: asNumber(message[4])
        });
      });
    }
  };
  const onArgs = {
    type: "spawn.args",
    action(args, context) {
      if (!progressMethods.includes(context.method)) {
        return args;
      }
      return including(args, progressCommand);
    }
  };
  return [onArgs, onProgress];
}
function progressEventStage(input) {
  return String(input.toLowerCase().split(" ", 1)) || "unknown";
}
init_utils();
function spawnOptionsPlugin(spawnOptions) {
  const options = pick(spawnOptions, ["uid", "gid"]);
  return {
    type: "spawn.options",
    action(data) {
      return { ...options, ...data };
    }
  };
}
function timeoutPlugin({
  block,
  stdErr = true,
  stdOut = true
}) {
  if (block > 0) {
    return {
      type: "spawn.after",
      action(_data, context) {
        let timeout;
        function wait() {
          timeout && clearTimeout(timeout);
          timeout = setTimeout(kill, block);
        }
        function stop() {
          context.spawned.stdout?.off("data", wait);
          context.spawned.stderr?.off("data", wait);
          context.spawned.off("exit", stop);
          context.spawned.off("close", stop);
          timeout && clearTimeout(timeout);
        }
        function kill() {
          stop();
          context.kill(new GitPluginError(void 0, "timeout", `block timeout reached`));
        }
        stdOut && context.spawned.stdout?.on("data", wait);
        stdErr && context.spawned.stderr?.on("data", wait);
        context.spawned.on("exit", stop);
        context.spawned.on("close", stop);
        wait();
      }
    };
  }
}
init_pathspec();
function suffixPathsPlugin() {
  return {
    type: "spawn.args",
    action(data) {
      const prefix = [];
      let suffix;
      function append2(args) {
        (suffix = suffix || []).push(...args);
      }
      for (let i = 0; i < data.length; i++) {
        const param = data[i];
        if (isPathSpec(param)) {
          append2(toPaths(param));
          continue;
        }
        if (param === "--") {
          append2(
            data.slice(i + 1).flatMap((item) => isPathSpec(item) && toPaths(item) || item)
          );
          break;
        }
        prefix.push(param);
      }
      return !suffix ? prefix : [...prefix, "--", ...suffix.map(String)];
    }
  };
}
init_utils();
var Git = require_git();
function gitInstanceFactory(baseDir, options) {
  const plugins = new PluginStore();
  const config = createInstanceConfig(
    baseDir && (typeof baseDir === "string" ? { baseDir } : baseDir) || {},
    options
  );
  if (!folderExists(config.baseDir)) {
    throw new GitConstructError(
      config,
      `Cannot use simple-git on a directory that does not exist`
    );
  }
  if (Array.isArray(config.config)) {
    plugins.add(commandConfigPrefixingPlugin(config.config));
  }
  plugins.add(blockUnsafeOperationsPlugin(config.unsafe));
  plugins.add(suffixPathsPlugin());
  plugins.add(completionDetectionPlugin(config.completion));
  config.abort && plugins.add(abortPlugin(config.abort));
  config.progress && plugins.add(progressMonitorPlugin(config.progress));
  config.timeout && plugins.add(timeoutPlugin(config.timeout));
  config.spawnOptions && plugins.add(spawnOptionsPlugin(config.spawnOptions));
  plugins.add(errorDetectionPlugin(errorDetectionHandler(true)));
  config.errors && plugins.add(errorDetectionPlugin(config.errors));
  customBinaryPlugin(plugins, config.binary, config.unsafe?.allowUnsafeCustomBinary);
  return new Git(config, plugins);
}
init_git_response_error();
var simpleGit = gitInstanceFactory;

// ../flow-engine/src/workspace/WorkspaceTypes.ts
var WorkspaceAllocationError = class extends Error {
  constructor(message) {
    super(`Workspace allocation error: ${message}`);
    this.name = "WorkspaceAllocationError";
  }
};

// ../flow-engine/src/workspace/WorkspaceGitStrategy.ts
function generateBranchName(taskId, description) {
  const shortId = taskId.substring(0, 4);
  const slug = description ? description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").substring(0, 30) : "task";
  return `fleet/task-${shortId}-${slug}`;
}
var WorkspaceGitStrategy = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  getGit(workingDir) {
    return simpleGit(workingDir);
  }
  async getGitState(workspacePath) {
    try {
      const git = this.getGit(workspacePath);
      const status = await git.status();
      const branch = status.current || "unknown";
      const isClean = status.isClean();
      const log = await git.log({ maxCount: 1 });
      const lastCommit = log.latest?.hash || "unknown";
      return { branch, isClean, lastCommit };
    } catch (error) {
      console.warn(`Failed to get git state for ${workspacePath}:`, error);
      return void 0;
    }
  }
  async isWorktree(workspacePath) {
    try {
      const git = this.getGit(this.projectRoot);
      const result = await git.raw(["worktree", "list", "--porcelain"]);
      return result.includes(workspacePath);
    } catch {
      return false;
    }
  }
  async setupGit(workspacePath, gitStrategy, gitBranch, taskMetadata, taskId) {
    if (!gitStrategy || gitStrategy === "none") return void 0;
    try {
      if (gitStrategy === "worktree") {
        return await this.setupWorktree(workspacePath, gitBranch, taskMetadata, taskId);
      }
      return await this.setupClone(workspacePath, gitStrategy, gitBranch, taskMetadata, taskId);
    } catch (error) {
      console.warn(`Git setup failed, continuing without git:`, error);
      return void 0;
    }
  }
  async removeWorktree(workspacePath) {
    const git = this.getGit(this.projectRoot);
    await git.raw(["worktree", "remove", workspacePath, "--force"]);
  }
  async setupWorktree(workspacePath, _gitBranch, taskMetadata, taskId) {
    try {
      const git = this.getGit(this.projectRoot);
      const branchName = generateBranchName(taskId, taskMetadata.description);
      const branches = await git.branch();
      const branchExists = branches.all.includes(branchName);
      if (!branchExists) {
        await git.checkoutBranch(branchName, "HEAD");
      }
      await git.raw(["worktree", "add", workspacePath, branchName]);
      console.log(`Created worktree at ${workspacePath} for branch ${branchName}`);
      return await this.getGitState(workspacePath);
    } catch (error) {
      throw new WorkspaceAllocationError(`Failed to create git worktree: ${error}`);
    }
  }
  async setupClone(workspacePath, gitStrategy, gitBranch, taskMetadata, taskId) {
    try {
      const git = simpleGit();
      const cloneOptions = gitStrategy === "main-only" ? ["--depth", "1"] : [];
      await git.clone(this.projectRoot, workspacePath, cloneOptions);
      const workspaceGit = this.getGit(workspacePath);
      switch (gitStrategy) {
        case "main-only":
          await workspaceGit.checkout(gitBranch);
          console.log(`Checked out ${gitBranch} in ${workspacePath}`);
          break;
        case "feature-branch": {
          const branchName = generateBranchName(taskId, taskMetadata.description);
          await workspaceGit.checkoutBranch(branchName, gitBranch);
          console.log(`Created feature branch ${branchName} in ${path.basename(workspacePath)}`);
          break;
        }
        case "any":
          await workspaceGit.checkout(gitBranch);
          console.log(`Checked out ${gitBranch} in ${workspacePath}`);
          break;
      }
      return await this.getGitState(workspacePath);
    } catch (error) {
      throw new WorkspaceAllocationError(`Failed to setup git: ${error}`);
    }
  }
};

// ../flow-engine/src/workspace/WorkspacePruner.ts
var fs = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
function removeWithMeta(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  } catch (err) {
    process.stderr.write(`[WorkspacePruner] failed to remove ${dirPath}: ${String(err)}
`);
  }
  const metaPath = dirPath + ".meta";
  try {
    if (fs.existsSync(metaPath)) {
      fs.rmSync(metaPath, { recursive: true, force: true });
    }
  } catch {
  }
}
async function pruneWorkspaces(basePath, config, activeWorkspaces) {
  if (!fs.existsSync(basePath)) return;
  const activePaths = /* @__PURE__ */ new Set();
  for (const ws of activeWorkspaces.values()) {
    activePaths.add(ws.path);
  }
  const entries = fs.readdirSync(basePath, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.endsWith(".meta")).map((e) => {
    const full = path2.join(basePath, e.name);
    const stat = fs.statSync(full);
    return { full, mtime: stat.mtimeMs };
  }).filter((e) => !activePaths.has(e.full));
  const cutoffMs = config.retainDays * 86400 * 1e3;
  const now = Date.now();
  const surviving = entries.filter((e) => {
    if (now - e.mtime > cutoffMs) {
      removeWithMeta(e.full);
      return false;
    }
    return true;
  });
  if (surviving.length > config.maxWorkspaces) {
    const sorted2 = surviving.sort((a, b) => a.mtime - b.mtime);
    for (const e of sorted2.slice(0, sorted2.length - config.maxWorkspaces)) {
      removeWithMeta(e.full);
    }
  }
}
function pruneWorkspaceDirAtStartup(basePath, retainDays, maxWorkspaces) {
  if (!fs.existsSync(basePath)) return;
  let rawEntries;
  try {
    rawEntries = fs.readdirSync(basePath);
  } catch (err) {
    process.stderr.write(`[WorkspacePruner] failed to read workspace dir: ${String(err)}
`);
    return;
  }
  const dirs = [];
  for (const name of rawEntries) {
    if (name.endsWith(".meta")) continue;
    const fullPath = path2.join(basePath, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;
      dirs.push({ fullPath, mtimeMs: stat.mtimeMs });
    } catch {
    }
  }
  dirs.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const cutoffMs = Date.now() - retainDays * 24 * 60 * 60 * 1e3;
  const remaining = [];
  for (const d of dirs) {
    if (d.mtimeMs < cutoffMs) {
      removeWithMeta(d.fullPath);
    } else {
      remaining.push(d);
    }
  }
  const excess = remaining.length - maxWorkspaces;
  if (excess > 0) {
    for (const d of remaining.slice(0, excess)) {
      removeWithMeta(d.fullPath);
    }
  }
}

// ../flow-engine/src/workspace/WorkspaceManager.ts
var WorkspaceManager = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.basePath = path3.join(projectRoot, ".agent-fleet", "workspaces");
    this.git = new WorkspaceGitStrategy(projectRoot);
    if (!fs2.existsSync(this.basePath)) {
      fs2.mkdirSync(this.basePath, { recursive: true });
    }
  }
  workspaces = /* @__PURE__ */ new Map();
  workspacesByTask = /* @__PURE__ */ new Map();
  basePath;
  git;
  async allocate(options) {
    const { taskId, config, gitBranch = "main", existingPath, taskMetadata = {}, autoCreate = true } = options;
    if (this.workspacesByTask.has(taskId)) {
      const ws = this.workspaces.get(this.workspacesByTask.get(taskId));
      if (ws) return ws;
    }
    if (config.mode === "manual") {
      if (!existingPath) throw new WorkspaceAllocationError("Manual mode requires existingPath");
      return this.allocateManual(taskId, existingPath, config);
    }
    if (config.mode === "shared") {
      if (config.reusePolicy !== "never") {
        const reusable = await this.findReusable(taskId, config, gitBranch);
        if (reusable) {
          console.log(`Reusing shared workspace ${reusable.id} for execution ${taskId}`);
          return reusable;
        }
      }
      if (config.reusePolicy === "never" || autoCreate) {
        return this.createWorkspace(taskId, "shared", config, gitBranch, taskMetadata);
      }
    }
    if (config.mode === "isolated") {
      return this.createWorkspace(taskId, "isolated", config, gitBranch, taskMetadata);
    }
    throw new WorkspaceAllocationError(`Unsupported workspace mode: ${config.mode}`);
  }
  async release(workspaceId, taskId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      console.warn(`Attempted to release non-existent workspace: ${workspaceId}`);
      return;
    }
    workspace.concurrency.activeTasks.delete(taskId);
    this.workspacesByTask.delete(taskId);
    console.log(
      `Released workspace ${workspaceId} from task ${taskId}. Active tasks: ${workspace.concurrency.activeTasks.size}`
    );
    if (workspace.mode === "isolated" && workspace.concurrency.activeTasks.size === 0) {
      await this.cleanup(workspaceId);
    }
  }
  async cleanup(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;
    console.log(`Cleaning up workspace ${workspaceId} (mode: ${workspace.mode})`);
    if (workspace.mode === "manual") {
      this.deregister(workspaceId);
      return;
    }
    const isWorktree = await this.git.isWorktree(workspace.path);
    if (isWorktree) {
      try {
        await this.git.removeWorktree(workspace.path);
        console.log(`Removed worktree at ${workspace.path}`);
      } catch (error) {
        console.error(`Failed to remove worktree: ${error}`);
        this.removeDirSafe(workspace.path);
      }
    } else {
      this.removeDirSafe(workspace.path);
    }
    this.deregister(workspaceId);
  }
  async pruneOldWorkspaces(config) {
    await pruneWorkspaces(this.basePath, config, this.workspaces);
  }
  async cleanupAll() {
    console.log(`Cleaning up all ${this.workspaces.size} workspaces`);
    for (const id of Array.from(this.workspaces.keys())) {
      await this.cleanup(id);
      await new Promise((resolve4) => setTimeout(resolve4, 50));
    }
  }
  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }
  getWorkspaceForTask(taskId) {
    const id = this.workspacesByTask.get(taskId);
    return id ? this.workspaces.get(id) : void 0;
  }
  getAllWorkspaces() {
    return Array.from(this.workspaces.values());
  }
  isActive(workspaceId) {
    return (this.workspaces.get(workspaceId)?.concurrency.activeTasks.size ?? 0) > 0;
  }
  touch(workspaceId) {
    const ws = this.workspaces.get(workspaceId);
    if (ws) {
      ws.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      ws.usageCount++;
    }
  }
  getBasePath() {
    return this.basePath;
  }
  getStats() {
    const all = this.getAllWorkspaces();
    return {
      total: all.length,
      isolated: all.filter((w) => w.mode === "isolated").length,
      shared: all.filter((w) => w.mode === "shared").length,
      totalActiveTasks: all.reduce((s, w) => s + w.concurrency.activeTasks.size, 0)
    };
  }
  /** Static startup pruning — no active workspaces in memory yet. */
  static pruneOldWorkspaceDir(basePath, retainDays, maxWorkspaces) {
    pruneWorkspaceDirAtStartup(basePath, retainDays, maxWorkspaces);
  }
  // ── private helpers ──────────────────────────────────────────────────────
  async findReusable(taskId, config, gitBranch) {
    const key = config.concurrencyKey || "default";
    for (const ws of this.workspaces.values()) {
      if (ws.mode !== "shared") continue;
      if (ws.concurrency.key !== key) continue;
      if (ws.concurrency.locked) continue;
      if ((config.gitStrategy === "main-only" || config.gitStrategy === "any") && ws.git?.branch !== gitBranch)
        continue;
      ws.concurrency.activeTasks.add(taskId);
      ws.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      ws.usageCount++;
      this.workspacesByTask.set(taskId, ws.id);
      return ws;
    }
    return void 0;
  }
  async allocateManual(taskId, workspacePath, config) {
    if (!fs2.existsSync(workspacePath))
      throw new WorkspaceAllocationError(`Manual workspace path does not exist: ${workspacePath}`);
    const gitState = await this.git.getGitState(workspacePath);
    if (gitState && !gitState.isClean)
      console.warn(`\u26A0\uFE0F  Manual workspace has uncommitted changes: ${workspacePath}`);
    if (!gitState) console.warn(`\u26A0\uFE0F  Manual workspace is not a git repository: ${workspacePath}`);
    const id = v4_default();
    const metaDir = workspacePath + ".meta";
    fs2.mkdirSync(path3.join(metaDir, "outputs"), { recursive: true });
    const ws = {
      id,
      path: workspacePath,
      metaDir,
      mode: "manual",
      git: gitState,
      concurrency: { key: config.concurrencyKey || id, activeTasks: /* @__PURE__ */ new Set([taskId]), locked: true },
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastUsedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usageCount: 1
    };
    this.workspaces.set(id, ws);
    this.workspacesByTask.set(taskId, id);
    console.log(`Allocated manual workspace ${id} for execution ${taskId}`);
    return ws;
  }
  async createWorkspace(taskId, mode, config, gitBranch, taskMetadata) {
    const id = v4_default();
    const prefix = mode === "shared" ? "shared" : "isolated";
    const workspacePath = path3.join(this.basePath, `${prefix}-${id}`);
    const metaDir = workspacePath + ".meta";
    try {
      fs2.mkdirSync(workspacePath, { recursive: true });
      fs2.mkdirSync(path3.join(metaDir, "outputs"), { recursive: true });
    } catch (error) {
      throw new WorkspaceAllocationError(`Failed to create workspace directory: ${error}`);
    }
    const gitState = await this.git.setupGit(workspacePath, config.gitStrategy, gitBranch, taskMetadata, taskId);
    const ws = {
      id,
      path: workspacePath,
      metaDir,
      mode,
      git: gitState,
      concurrency: {
        key: config.concurrencyKey || (mode === "shared" ? "default" : id),
        activeTasks: /* @__PURE__ */ new Set([taskId]),
        locked: mode === "isolated"
      },
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastUsedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usageCount: 1
    };
    this.workspaces.set(id, ws);
    this.workspacesByTask.set(taskId, id);
    console.log(`Created ${mode} workspace ${id} for execution ${taskId}`);
    return ws;
  }
  deregister(workspaceId) {
    this.workspaces.delete(workspaceId);
    for (const [taskId, wId] of this.workspacesByTask.entries()) {
      if (wId === workspaceId) this.workspacesByTask.delete(taskId);
    }
  }
  removeDirSafe(dirPath) {
    try {
      if (fs2.existsSync(dirPath))
        fs2.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      console.error(`Failed to remove workspace directory: ${error}`);
    }
  }
};

// dist/cli/commands/DocsCommand.js
var fs3 = __toESM(require("fs"), 1);
function registerDocsCommand(program2) {
  program2.command("docs").description("Print flow engine capabilities documentation").option("-o, --output <file>", "Write output to a file instead of stdout").action((options) => {
    const generator = new FlowCapabilitiesGenerator();
    const content = generator.generate();
    if (options.output) {
      try {
        fs3.writeFileSync(options.output, content, "utf-8");
      } catch (err) {
        console.error(`Failed to write to ${options.output}.`);
        process.exit(1);
      }
      console.log(`\u2713 Docs written to ${options.output}`);
    } else {
      process.stdout.write(content + "\n");
    }
  });
}

// dist/cli/commands/HistoryCommand.js
var fs4 = __toESM(require("node:fs"), 1);
var os = __toESM(require("node:os"), 1);
var path4 = __toESM(require("node:path"), 1);
function loadExecutions(dir) {
  if (!fs4.existsSync(dir))
    return [];
  const results = [];
  for (const file of fs4.readdirSync(dir)) {
    if (!file.endsWith(".json"))
      continue;
    try {
      const raw = fs4.readFileSync(path4.join(dir, file), "utf8");
      const rec = JSON.parse(raw);
      if (rec.executionId)
        results.push(rec);
    } catch {
    }
  }
  results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return results;
}
function pad(s, width) {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}
function formatDuration(startedAt, completedAt) {
  if (!completedAt)
    return "running";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1e3)
    return `${ms}ms`;
  if (ms < 6e4)
    return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}
function formatStarted(iso) {
  return iso.replace("T", " ").slice(0, 19);
}
function renderDetailView(exec) {
  const lines = [];
  lines.push(`Execution: ${exec.executionId}`);
  lines.push(`Flow:      ${exec.flowId}`);
  lines.push(`File:      ${exec.flowFile}`);
  lines.push(`Status:    ${exec.status}`);
  lines.push(`Started:   ${formatStarted(exec.startedAt)}`);
  if (exec.completedAt)
    lines.push(`Completed: ${formatStarted(exec.completedAt)}`);
  lines.push(`Duration:  ${formatDuration(exec.startedAt, exec.completedAt)}`);
  lines.push("");
  lines.push("Steps:");
  const COL_STEP = 32;
  const COL_STATUS = 12;
  const COL_DURATION = 12;
  const header = "  " + pad("STEP", COL_STEP) + pad("STATUS", COL_STATUS) + "DURATION";
  const sep = "  " + "-".repeat(COL_STEP + COL_STATUS + COL_DURATION);
  lines.push(header);
  lines.push(sep);
  for (const [stepId, step] of Object.entries(exec.steps)) {
    const name = step.injected ? `${stepId}*` : stepId;
    const dur = step.startedAt ? formatDuration(step.startedAt, step.completedAt ?? null) : "-";
    lines.push("  " + pad(name, COL_STEP) + pad(step.status, COL_STATUS) + dur);
  }
  lines.push("");
  lines.push("  * = dynamically injected step");
  return lines.join("\n");
}
function buildHistoryTable(execs, opts) {
  if (opts.id) {
    const matches = execs.filter((e) => e.executionId.startsWith(opts.id));
    if (matches.length > 1) {
      return `Ambiguous execution ID prefix "${opts.id}" \u2014 matches: ${matches.map((e) => e.executionId).join(", ")}`;
    }
    const exec = matches[0];
    if (!exec)
      return `Execution '${opts.id}' not found.`;
    return renderDetailView(exec);
  }
  let filtered = execs;
  if (opts.status)
    filtered = filtered.filter((e) => e.status === opts.status);
  if (opts.flow)
    filtered = filtered.filter((e) => e.flowId === opts.flow);
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const total = filtered.length;
  filtered = filtered.slice(offset, offset + limit);
  if (filtered.length === 0)
    return offset > 0 ? `No more executions (showing ${offset}+).` : "No executions found.";
  const COL_ID = 12;
  const COL_FLOW = 32;
  const COL_STATUS = 12;
  const COL_STARTED = 22;
  const lines = [];
  lines.push(pad("EXECUTION", COL_ID) + pad("FLOW", COL_FLOW) + pad("STATUS", COL_STATUS) + pad("STARTED", COL_STARTED) + "DURATION");
  lines.push("-".repeat(COL_ID + COL_FLOW + COL_STATUS + COL_STARTED + 12));
  for (const e of filtered) {
    lines.push(pad(e.executionId, COL_ID) + pad(e.flowId, COL_FLOW) + pad(e.status, COL_STATUS) + pad(formatStarted(e.startedAt), COL_STARTED) + formatDuration(e.startedAt, e.completedAt));
  }
  if (total > offset + limit) {
    lines.push(`
  Showing ${offset + 1}\u2013${offset + filtered.length} of ${total}. Use --offset ${offset + limit} for next page.`);
  } else if (offset > 0) {
    lines.push(`
  Showing ${offset + 1}\u2013${offset + filtered.length} of ${total}.`);
  }
  return lines.join("\n");
}
function registerHistoryCommand(program2) {
  program2.command("history").description("List past flow executions").option("-n, --limit <n>", "Max number of executions to show (default: 20)", parseInt).option("--offset <n>", "Skip first N executions (for pagination)", parseInt).option("--status <status>", "Filter by status (completed|failed|running|queued)").option("--flow <flowId>", "Filter by flow ID").option("--id <executionId>", "Show detail for a specific execution (steps + injected* markers)").action((opts) => {
    const daemonDir = path4.join(os.homedir(), ".flow-daemon");
    const executionsDir = path4.join(daemonDir, "executions");
    const execs = loadExecutions(executionsDir);
    console.log(buildHistoryTable(execs, opts));
  });
}

// dist/cli/commands/RunCommand.js
var import_singleton_daemon_kit2 = __toESM(require_dist3(), 1);
var fs10 = __toESM(require("node:fs"), 1);
var os4 = __toESM(require("node:os"), 1);
var path9 = __toESM(require("node:path"), 1);

// dist/config/FlowConfig.js
var fs5 = __toESM(require("node:fs"), 1);
var DEFAULT_CONFIG = {
  queue: { concurrency: 1 },
  logs: { retainDays: 30 },
  worker: { wsPort: null },
  security: { allowAbsolutePaths: false },
  limits: {
    maxInjectedSteps: 20,
    maxStepsPerExecution: 50
  },
  workspace: { retainDays: 30, maxWorkspaces: 50 }
};
function loadFlowConfig(configFile) {
  if (!fs5.existsSync(configFile))
    return DEFAULT_CONFIG;
  try {
    const loaded = load(fs5.readFileSync(configFile, "utf8"), {
      schema: JSON_SCHEMA
    });
    return {
      queue: { ...DEFAULT_CONFIG.queue, ...loaded?.queue },
      logs: { ...DEFAULT_CONFIG.logs, ...loaded?.logs },
      worker: { ...DEFAULT_CONFIG.worker, ...loaded?.worker },
      security: { ...DEFAULT_CONFIG.security, ...loaded?.security },
      limits: { ...DEFAULT_CONFIG.limits, ...loaded?.limits },
      workspace: { ...DEFAULT_CONFIG.workspace, ...loaded?.workspace }
    };
  } catch {
    process.stderr.write("Warning: daemon config could not be parsed, using defaults.\n");
    return DEFAULT_CONFIG;
  }
}

// dist/daemon/Daemon.js
var import_singleton_daemon_kit = __toESM(require_dist3(), 1);
var import_node_child_process3 = require("node:child_process");
var fs9 = __toESM(require("node:fs"), 1);
var os3 = __toESM(require("node:os"), 1);
var path8 = __toESM(require("node:path"), 1);

// ../extension-points/src/sensitiveFields.ts
var SENSITIVE_FIELDS = [
  "token",
  "password",
  "secret",
  "key",
  "apiKey",
  "privateKey",
  "accessToken",
  "bearerToken"
];

// ../extension-points/src/releaseWorkspace.ts
async function releaseWorkspace(provider, handle, priorError) {
  try {
    await provider.release(handle);
  } catch (releaseErr) {
    const releaseMsg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
    if (priorError !== void 0) {
      console.warn(
        `[workspace] Failed to release workspace "${handle.id}": ${releaseMsg}. Original error is propagated.`
      );
      throw priorError;
    }
    throw releaseErr;
  }
}

// dist/config/ConfigLoader.js
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path2 = require("node:path");
var SENSITIVE_FIELD_SET = new Set(SENSITIVE_FIELDS);
function resolveEnvVars(options) {
  const result = {};
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "string") {
      const interpolated = value.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
        const envValue = process.env[varName];
        if (envValue === void 0) {
          throw new Error(`Environment variable "${varName}" is not set (referenced as \${${varName}})`);
        }
        return envValue;
      });
      result[key] = interpolated;
    } else {
      result[key] = value;
    }
  }
  return result;
}
function validateNoLiteralCredentials(options, context) {
  for (const [key, value] of Object.entries(options)) {
    if (SENSITIVE_FIELD_SET.has(key) && typeof value === "string") {
      const isEnvVar = /^\$\{[^}]+\}$/.test(value);
      if (!isEnvVar) {
        throw new Error(`Literal credential value in ${context}: sensitive field "${key}" must use \${ENV_VAR} interpolation, not a literal value`);
      }
    }
  }
}
function loadYamlFile(filePath) {
  let content;
  try {
    content = (0, import_node_fs.readFileSync)(filePath, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR")
      return null;
    throw err;
  }
  try {
    return load(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML config at "${filePath}": ${message}`);
  }
}
var ConfigLoader = class {
  globalConfigPath;
  projectConfigPath;
  envVarOverride;
  constructor(options = {}) {
    this.envVarOverride = process.env["FLOW_CONFIG"];
    this.globalConfigPath = options.globalConfigPath ?? (0, import_node_path2.join)((0, import_node_os.homedir)(), ".flow", "config.yml");
    this.projectConfigPath = options.projectConfigPath ?? (0, import_node_path2.join)(process.cwd(), ".flow", "config.yml");
  }
  async load() {
    const globalConfig = await this.loadGlobalConfig();
    const projectConfig = this.loadProjectConfig();
    return this.merge(globalConfig, projectConfig);
  }
  async loadGlobalConfig() {
    if (this.envVarOverride) {
      const exists2 = await (0, import_promises.access)(this.envVarOverride).then(() => true).catch(() => false);
      if (!exists2) {
        throw new Error(`FLOW_CONFIG is set to "${this.envVarOverride}" but the file was not found`);
      }
      const config2 = loadYamlFile(this.envVarOverride);
      this.validateGlobalConfig(config2 ?? {});
      return config2 ?? {};
    }
    const config = loadYamlFile(this.globalConfigPath);
    this.validateGlobalConfig(config ?? {});
    return config ?? {};
  }
  validateGlobalConfig(config) {
    const instances = config.plugins?.instances ?? {};
    for (const [instanceName, instance] of Object.entries(instances)) {
      if (instance.options) {
        validateNoLiteralCredentials(instance.options, `global.instances.${instanceName}.options`);
      }
    }
  }
  loadProjectConfig() {
    const config = loadYamlFile(this.projectConfigPath);
    return config ?? {};
  }
  merge(global, project) {
    const result = {};
    const projectPlugins = project.plugins ?? {};
    for (const [feature, projectSection] of Object.entries(projectPlugins)) {
      if (!projectSection)
        continue;
      const resolved = this.resolveFeature(feature, projectSection, global);
      result[feature] = resolved;
    }
    return result;
  }
  /** Resolves a standalone feature section against the global config (for per-flow overrides). */
  async resolveStandaloneSection(featureName, section) {
    const globalConfig = await this.loadGlobalConfig();
    return this.resolveFeature(featureName, section, globalConfig);
  }
  resolveFeature(featureName, section, global) {
    const hasUse = section.use !== void 0;
    const hasInstance = section.instance !== void 0;
    if (hasUse && hasInstance) {
      throw new Error(`Plugin config error for "${featureName}": both "use" and "instance" are present - they are mutually exclusive`);
    }
    const sectionOptions = section.options ?? {};
    validateNoLiteralCredentials(sectionOptions, `${featureName}.options`);
    const resolvedSectionOptions = resolveEnvVars(sectionOptions);
    if (hasUse) {
      const instanceName = section.use;
      const instances = global.plugins?.instances ?? {};
      const globalInstance = instances[instanceName];
      if (!globalInstance) {
        throw new Error(`Plugin config error for "${featureName}": instance "${instanceName}" not found in global config`);
      }
      const instanceOptions = globalInstance.options ?? {};
      validateNoLiteralCredentials(instanceOptions, `global.instances.${instanceName}.options`);
      const resolvedInstanceOptions = resolveEnvVars(instanceOptions);
      return {
        type: globalInstance.type,
        // Shallow merge: section-level options override instance options
        options: { ...resolvedInstanceOptions, ...resolvedSectionOptions },
        pluginsDir: globalInstance.pluginsDir
      };
    }
    if (hasInstance) {
      const inlineInstance = section.instance;
      const instanceOptions = inlineInstance.options ?? {};
      validateNoLiteralCredentials(instanceOptions, `${featureName}.instance.options`);
      const resolvedInstanceOptions = resolveEnvVars(instanceOptions);
      return {
        type: inlineInstance.type,
        options: { ...resolvedInstanceOptions, ...resolvedSectionOptions },
        pluginsDir: inlineInstance.pluginsDir
      };
    }
    throw new Error(`Plugin config error for "${featureName}": neither "use" nor "instance" is present`);
  }
};

// dist/config/PluginLoader.js
var import_node_fs2 = require("node:fs");
var import_promises2 = require("node:fs/promises");
var import_node_module = require("node:module");
var import_node_path3 = require("node:path");
var import_node_url = require("node:url");
function loadRegistry(registryPath) {
  try {
    const content = (0, import_node_fs2.readFileSync)(registryPath, "utf8");
    return JSON.parse(content);
  } catch {
    throw new Error(`Failed to load extension-points registry from "${registryPath}"`);
  }
}
function parseTypeRef(typeRef) {
  const match = typeRef.match(/^plugins\.([^.]+)\.([^.]+)$/);
  if (!match) {
    throw new Error(`Invalid plugin type reference "${typeRef}". Expected format: plugins.<pluginId>.<implName>`);
  }
  return { pluginId: match[1], implName: match[2] };
}
var _require = (0, import_node_module.createRequire)(__importMetaUrl);
var PluginLoader = class {
  pluginPackagesDir;
  registryPath;
  registryCache = null;
  constructor(options = {}) {
    this.pluginPackagesDir = options.pluginPackagesDir;
    if (options.registryPath) {
      this.registryPath = options.registryPath;
    } else {
      this.registryPath = _require.resolve("extension-points/extension-points.json");
    }
  }
  async loadProvider(typeRef, extensionPoint, options, pluginsDir) {
    const { pluginId, implName } = parseTypeRef(typeRef);
    const manifest = await this.loadManifest(pluginId, pluginsDir);
    if (manifest.pluginId !== pluginId) {
      throw new Error(`Plugin manifest pluginId mismatch: manifest declares "${manifest.pluginId}" but expected "${pluginId}"`);
    }
    const extPointImpls = manifest.implementations[extensionPoint];
    if (!extPointImpls) {
      throw new Error(`Plugin "${pluginId}" does not provide any implementation for extension point "${extensionPoint}"`);
    }
    const impl = extPointImpls[implName];
    if (!impl) {
      throw new Error(`Plugin "${pluginId}" does not provide implementation "${implName}" for extension point "${extensionPoint}"`);
    }
    if (impl.version === void 0) {
      throw new Error(`Plugin "${pluginId}" implementation "${implName}" for extension point "${extensionPoint}" is missing the required "version" field`);
    }
    this.assertVersionSupported(extensionPoint, impl.version);
    if (impl.provider) {
      return impl.provider(options);
    }
    if (impl.entrypoint !== void 0) {
      const pluginDir = await this.resolvePluginDir(pluginId, pluginsDir);
      const resolvedEntrypoint = (0, import_node_path3.resolve)(pluginDir, impl.entrypoint);
      const rel = (0, import_node_path3.relative)(pluginDir, resolvedEntrypoint);
      if (rel.startsWith("..") || (0, import_node_path3.resolve)(rel) === rel) {
        throw new Error(`Plugin "${pluginId}" entrypoint "${impl.entrypoint}" traverses outside the package root`);
      }
      const exists2 = await (0, import_promises2.access)(resolvedEntrypoint).then(() => true).catch(() => false);
      if (!exists2) {
        throw new Error(`Plugin "${pluginId}" entrypoint file "${resolvedEntrypoint}" does not exist`);
      }
      const exportName = impl.export;
      if (!exportName) {
        throw new Error(`Plugin "${pluginId}" JSON manifest has "entrypoint" but no "export" field`);
      }
      const moduleUrl = (0, import_node_url.pathToFileURL)(resolvedEntrypoint).href;
      const mod = await import(moduleUrl);
      const factory = mod[exportName];
      if (typeof factory !== "function") {
        throw new Error(`Plugin "${pluginId}" entrypoint does not export "${exportName}" as a function`);
      }
      return factory(options);
    }
    throw new Error(`Plugin "${pluginId}" implementation "${implName}" has no provider factory or entrypoint/export`);
  }
  async loadManifest(pluginId, pluginsDir) {
    const pluginDir = await this.resolvePluginDir(pluginId, pluginsDir);
    const jsManifestPath = (0, import_node_path3.join)(pluginDir, "plugin.config.js");
    const jsonManifestPath = (0, import_node_path3.join)(pluginDir, "plugin.manifest.json");
    const hasJsManifest = await (0, import_promises2.access)(jsManifestPath).then(() => true).catch(() => false);
    if (hasJsManifest) {
      const moduleUrl = (0, import_node_url.pathToFileURL)(jsManifestPath).href;
      const mod = await import(moduleUrl);
      const manifest = mod["manifest"] ?? mod["default"];
      if (!manifest || typeof manifest !== "object") {
        throw new Error(`Plugin "${pluginId}" manifest at "${jsManifestPath}" did not export a "manifest" object`);
      }
      return manifest;
    }
    const hasJsonManifest = await (0, import_promises2.access)(jsonManifestPath).then(() => true).catch(() => false);
    if (hasJsonManifest) {
      const content = (0, import_node_fs2.readFileSync)(jsonManifestPath, "utf8");
      return JSON.parse(content);
    }
    throw new Error(`No manifest found for plugin "${pluginId}". Expected "${jsManifestPath}" or "${jsonManifestPath}"`);
  }
  async resolvePluginDir(pluginId, pluginsDir) {
    if (pluginsDir !== void 0) {
      if (!(0, import_node_path3.isAbsolute)(pluginsDir)) {
        throw new Error(`pluginsDir must be an absolute path, got: "${pluginsDir}"`);
      }
      return (0, import_node_path3.join)(pluginsDir, `plugin-${pluginId}`);
    }
    if (this.pluginPackagesDir !== void 0) {
      return (0, import_node_path3.join)(this.pluginPackagesDir, `plugin-${pluginId}`);
    }
    try {
      const manifestExportPath = _require.resolve(`plugin-${pluginId}/plugin.config`);
      return (0, import_node_path3.join)(manifestExportPath, "..");
    } catch {
      throw new Error(`No manifest found for plugin "${pluginId}". Ensure "plugin-${pluginId}" is installed as a dependency of flow-cli.`);
    }
  }
  assertVersionSupported(extensionPoint, version) {
    if (!this.registryCache) {
      this.registryCache = loadRegistry(this.registryPath);
    }
    const registry = this.registryCache;
    const epEntry = registry.extensionPoints.find((ep) => ep.id === extensionPoint);
    if (!epEntry) {
      throw new Error(`Extension point "${extensionPoint}" is not registered in extension-points.json`);
    }
    const supported = epEntry.versions.map((v) => v.version);
    if (!supported.includes(version)) {
      throw new Error(`Version ${version} for extension point "${extensionPoint}" is not supported. Supported: [${supported.join(", ")}]`);
    }
  }
};

// dist/config/PluginResolver.js
async function createPerFlowWorkspaceResolver(options = {}) {
  const configLoader = new ConfigLoader({
    globalConfigPath: options.globalConfigPath,
    projectConfigPath: options.projectConfigPath
  });
  const pluginLoader = new PluginLoader({
    pluginPackagesDir: options.pluginPackagesDir,
    registryPath: options.registryPath
  });
  return async (section) => {
    const resolved = await configLoader.resolveStandaloneSection("workspace", section);
    return pluginLoader.loadProvider(resolved.type, "workspace", resolved.options ?? {}, resolved.pluginsDir);
  };
}
async function resolvePlugins(options = {}) {
  const configLoader = new ConfigLoader({
    globalConfigPath: options.globalConfigPath,
    projectConfigPath: options.projectConfigPath
  });
  const pluginLoader = new PluginLoader({
    pluginPackagesDir: options.pluginPackagesDir,
    registryPath: options.registryPath
  });
  const config = await configLoader.load();
  const result = {};
  if (!config.workspace) {
    throw new Error("No workspace provider configured. Add a plugins.workspace section to .flow/config.yml");
  }
  if (!config.workspace.type) {
    throw new Error("workspace.type is required in config. Expected format: plugins.<pluginId>.<implName>");
  }
  result.workspaceProvider = await pluginLoader.loadProvider(config.workspace.type, "workspace", config.workspace.options ?? {}, config.workspace.pluginsDir);
  if (config.approval) {
    result.approvalProvider = await pluginLoader.loadProvider(config.approval.type, "approval", config.approval.options ?? {}, config.approval.pluginsDir);
  }
  return result;
}

// dist/hooks/HookDispatcher.js
var import_node_child_process = require("node:child_process");
var http = __toESM(require("node:http"), 1);
var https = __toESM(require("node:https"), 1);
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var HookDispatcher = class {
  hooks;
  constructor(hooks) {
    this.hooks = hooks;
  }
  async dispatch(event, payload, onError2) {
    const hookList = this.hooks[event] ?? [];
    await Promise.all(hookList.map((hook) => this.runHook(hook, payload).catch((err) => {
      onError2?.(err);
    })));
  }
  async runHook(hook, payload) {
    switch (hook.type) {
      case "cli":
        await this.sendCliHook(hook, payload);
        return;
      case "http":
        await this.sendHttpHook(hook, payload);
        return;
      default: {
        const _exhaustive = hook;
        throw new Error(`Unknown hook type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  sendCliHook(hook, payload) {
    const payloadEnv = {};
    for (const [key, val] of Object.entries(payload)) {
      const envKey = key.replace(/([A-Z])/g, "_$1").toUpperCase();
      payloadEnv[envKey] = val !== null && val !== void 0 ? String(val) : "";
    }
    const baseEnv = {};
    if (process.env["PATH"])
      baseEnv["PATH"] = process.env["PATH"];
    if (process.env["HOME"])
      baseEnv["HOME"] = process.env["HOME"];
    if (process.env["TMPDIR"])
      baseEnv["TMPDIR"] = process.env["TMPDIR"];
    if (process.env["TEMP"])
      baseEnv["TEMP"] = process.env["TEMP"];
    if (process.env["TMP"])
      baseEnv["TMP"] = process.env["TMP"];
    if (process.platform === "win32") {
      if (process.env["SystemRoot"])
        baseEnv["SystemRoot"] = process.env["SystemRoot"];
      if (process.env["USERPROFILE"])
        baseEnv["USERPROFILE"] = process.env["USERPROFILE"];
    }
    const env = {
      ...baseEnv,
      ...payloadEnv,
      ...hook.env ?? {}
      // explicit hook-declared vars — highest priority
    };
    if (hook.debug) {
      return this.sendCliHookDebug(hook, env);
    }
    return execFileAsync(hook.command, hook.args, { env, timeout: 1e4 }).then(() => void 0);
  }
  // Runs the CLI hook with stdio: 'inherit' so stdout/stderr appear in the calling terminal.
  // Uses spawn (not execFile) because execFile does not support stdio inheritance.
  sendCliHookDebug(hook, env) {
    return new Promise((resolve4, reject) => {
      const child = (0, import_node_child_process.spawn)(hook.command, hook.args, { env, stdio: "inherit" });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("CLI hook timeout"));
      }, 1e4);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Hook exited with code ${String(code)}`));
        } else {
          resolve4();
        }
      });
    });
  }
  async sendHttpHook(hook, payload) {
    return new Promise((resolve4, reject) => {
      let settled = false;
      const settle = (fn) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      const body = JSON.stringify(payload);
      const url = new URL(hook.url);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: hook.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...hook.headers
        }
      };
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(options, (res) => {
        res.on("data", () => {
        });
        res.on("end", () => settle(resolve4));
      });
      req.on("error", (err) => settle(() => reject(err)));
      req.setTimeout(1e4, () => {
        req.destroy();
        settle(() => reject(new Error("HTTP hook timeout")));
      });
      req.write(body);
      req.end();
    });
  }
};

// dist/storage/ExecutionStore.js
var crypto3 = __toESM(require("node:crypto"), 1);
var fs6 = __toESM(require("node:fs"), 1);
var path5 = __toESM(require("node:path"), 1);
function generateExecutionId() {
  const hex = crypto3.randomUUID().replace(/-/g, "");
  return parseInt(hex.slice(0, 11), 16).toString(36).padStart(8, "0").slice(-8);
}
var EXECUTION_ID_RE = /^[a-z0-9]{8}$/;
function assertExecutionIdSafe(executionId) {
  if (!EXECUTION_ID_RE.test(executionId)) {
    throw new Error(`Invalid executionId format: ${JSON.stringify(executionId)}`);
  }
}
var ExecutionStore = class {
  executionsDir;
  retainDays;
  constructor(executionsDir, retainDays = 30) {
    this.executionsDir = executionsDir;
    this.retainDays = retainDays;
  }
  pruneOldExecutions() {
    let rawFiles;
    try {
      rawFiles = fs6.readdirSync(this.executionsDir);
    } catch (err) {
      process.stderr.write(`[ExecutionStore] failed to read executions dir for pruning: ${String(err)}
`);
      return;
    }
    const files = rawFiles.filter((f) => f.endsWith(".json"));
    if (files.length === 0)
      return;
    const cutoffMs = Date.now() - this.retainDays * 24 * 60 * 60 * 1e3;
    for (const file of files) {
      const filePath = path5.join(this.executionsDir, file);
      try {
        const content = fs6.readFileSync(filePath, "utf8");
        const state = JSON.parse(content);
        const timestamp2 = state.completedAt ?? state.startedAt;
        const ageMs = new Date(timestamp2).getTime();
        if (ageMs < cutoffMs) {
          fs6.unlinkSync(filePath);
        }
      } catch {
        try {
          const stat = fs6.statSync(filePath);
          if (stat.mtimeMs < cutoffMs)
            fs6.unlinkSync(filePath);
        } catch {
        }
      }
    }
  }
  create(params) {
    assertExecutionIdSafe(params.executionId);
    const state = {
      executionId: params.executionId,
      flowFile: params.flowFile,
      flowId: params.flowId,
      status: "queued",
      currentSteps: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      completedAt: null,
      steps: Object.fromEntries(params.stepIds.map((id) => [id, { status: "pending" }]))
    };
    this.write(state);
    return state;
  }
  exists(executionId) {
    assertExecutionIdSafe(executionId);
    return fs6.existsSync(this.filePath(executionId));
  }
  read(executionId) {
    assertExecutionIdSafe(executionId);
    const filePath = this.filePath(executionId);
    try {
      const content = fs6.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Corrupted execution state for ${executionId}: ${String(err)}`);
    }
  }
  update(executionId, patch) {
    const current = this.read(executionId);
    const updated = { ...current, ...patch };
    this.write(updated);
    return updated;
  }
  markStepRunning(executionId, stepId) {
    const state = this.read(executionId);
    state.steps[stepId] = {
      ...state.steps[stepId],
      status: "running",
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (!state.currentSteps.includes(stepId))
      state.currentSteps.push(stepId);
    if (state.status === "queued")
      state.status = "running";
    this.write(state);
    return state;
  }
  markStepCompleted(executionId, stepId) {
    const state = this.read(executionId);
    const step = state.steps[stepId];
    if (step) {
      step.status = "completed";
      step.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    state.currentSteps = state.currentSteps.filter((id) => id !== stepId);
    this.write(state);
    return state;
  }
  markStepFailed(executionId, stepId, error) {
    const state = this.read(executionId);
    const step = state.steps[stepId];
    if (step) {
      step.status = "failed";
      step.completedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (error !== void 0)
        step.error = error;
    }
    state.currentSteps = state.currentSteps.filter((id) => id !== stepId);
    if (error !== void 0)
      state.lastError = error;
    this.write(state);
    return state;
  }
  markExecutionCompleted(executionId) {
    return this.update(executionId, {
      status: "completed",
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      currentSteps: []
    });
  }
  markExecutionFailed(executionId) {
    return this.update(executionId, { status: "failed", completedAt: (/* @__PURE__ */ new Date()).toISOString(), currentSteps: [] });
  }
  filePath(executionId) {
    return path5.join(this.executionsDir, `${executionId}.json`);
  }
  write(state) {
    fs6.writeFileSync(this.filePath(state.executionId), JSON.stringify(state, null, 2), "utf8");
  }
};

// dist/storage/LogWriter.js
var fs7 = __toESM(require("node:fs"), 1);
var path6 = __toESM(require("node:path"), 1);
var HARD_CAP = 120;
var LogWriter = class {
  logsDir;
  retainDays;
  lastRotationDate = "";
  constructor(logsDir, retainDays = 30) {
    this.logsDir = logsDir;
    this.retainDays = retainDays;
  }
  write(executionId, stepId, entry) {
    let timestamp2;
    try {
      timestamp2 = new Date(entry.timestamp).toISOString();
    } catch {
      timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
    }
    const line = {
      prefix: `[${executionId}|${stepId}]`,
      timestamp: timestamp2,
      level: entry.level,
      message: entry.message
    };
    const filePath = path6.join(this.logsDir, `${this.todayDate()}.ndjson`);
    try {
      fs7.appendFileSync(filePath, JSON.stringify(line) + "\n", "utf8");
    } catch (err) {
      process.stderr.write(`[LogWriter] failed to write log: ${String(err)}
`);
    }
    this.rotate();
  }
  writeExecution(executionId, message, level = "info") {
    const line = {
      prefix: `[${executionId}|__execution]`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message
    };
    const filePath = path6.join(this.logsDir, `${this.todayDate()}.ndjson`);
    try {
      fs7.appendFileSync(filePath, JSON.stringify(line) + "\n", "utf8");
    } catch (err) {
      process.stderr.write(`[LogWriter] failed to write log: ${String(err)}
`);
    }
    this.rotate();
  }
  todayDate() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  rotate() {
    const today = this.todayDate();
    if (this.lastRotationDate === today)
      return;
    const limit = Math.min(this.retainDays, HARD_CAP);
    let files;
    try {
      files = fs7.readdirSync(this.logsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
    } catch {
      return;
    }
    while (files.length > limit) {
      const oldest = files.shift();
      try {
        fs7.unlinkSync(path6.join(this.logsDir, oldest));
      } catch {
      }
    }
    this.lastRotationDate = today;
  }
};

// dist/daemon/CommandHandler.js
var fs8 = __toESM(require("node:fs"), 1);
var os2 = __toESM(require("node:os"), 1);
var path7 = __toESM(require("node:path"), 1);
var DEFAULT_MAX_INJECTED_STEPS = 20;
var DEFAULT_MAX_STEPS_PER_EXECUTION = 50;
var CommandHandler = class {
  daemonDir;
  workerPool;
  hookDispatcher;
  allowAbsolutePaths;
  maxInjectedSteps;
  maxStepsPerExecution;
  workspaceProvider;
  approvalProvider;
  resolvePerFlowWorkspaceProvider;
  executionStore;
  logWriter;
  /** Per-execution FlowScheduler instances */
  schedulers = /* @__PURE__ */ new Map();
  /** Per-execution ExecutionContext */
  executionContexts = /* @__PURE__ */ new Map();
  /** Parent-child metadata for UI rendering (not scheduling logic) */
  parentChildIndex = /* @__PURE__ */ new Map();
  /** Per-execution step counts (initial + injected), for MAX_INJECTED_STEPS limit */
  stepCounts = /* @__PURE__ */ new Map();
  /** Central queue of ready steps across all executions */
  readyQueue = [];
  /** Per-execution hook dispatchers */
  executionHooks = /* @__PURE__ */ new Map();
  /** Per-execution plugin workspace handles (only when workspaceProvider is set) */
  pluginWorkspaceHandles = /* @__PURE__ */ new Map();
  /** Per-execution WorkspaceManager handles for the non-plugin path */
  nativeWorkspaceManagers = /* @__PURE__ */ new Map();
  activeExecutionCount = 0;
  constructor(daemonDir, workerPool, hookDispatcher, executionStore, logWriter, allowAbsolutePaths = false, maxInjectedSteps = DEFAULT_MAX_INJECTED_STEPS, maxStepsPerExecution = DEFAULT_MAX_STEPS_PER_EXECUTION, workspaceProvider, approvalProvider, resolvePerFlowWorkspaceProvider) {
    this.daemonDir = daemonDir;
    this.workerPool = workerPool;
    this.hookDispatcher = hookDispatcher;
    this.allowAbsolutePaths = allowAbsolutePaths;
    this.maxInjectedSteps = maxInjectedSteps;
    this.maxStepsPerExecution = maxStepsPerExecution;
    this.workspaceProvider = workspaceProvider;
    this.approvalProvider = approvalProvider;
    this.resolvePerFlowWorkspaceProvider = resolvePerFlowWorkspaceProvider;
    this.executionStore = executionStore ?? new ExecutionStore(path7.join(daemonDir, "executions"));
    this.logWriter = logWriter ?? new LogWriter(path7.join(daemonDir, "logs"));
  }
  dispatchHook(executionId, event, payload) {
    const dispatcher = this.executionHooks.get(executionId);
    void dispatcher?.dispatch(event, payload, (err) => {
      this.logWriter.writeExecution("__hook", `Hook '${event}' failed: ${String(err)}`, "error");
    });
  }
  removeExecutionHooks(executionId) {
    this.executionHooks.delete(executionId);
  }
  isQueueEmpty() {
    return this.readyQueue.length === 0;
  }
  hasActiveExecutions() {
    return this.activeExecutionCount > 0;
  }
  async handleRun(cmd, hookDispatcher) {
    const flowFile = path7.isAbsolute(cmd.flowFile) ? cmd.flowFile : path7.resolve(cmd.cwd, cmd.flowFile);
    if (!this.allowAbsolutePaths) {
      const allowedRoots = [path7.resolve(cmd.cwd), path7.resolve(os2.homedir())];
      let realFlowFile;
      try {
        realFlowFile = fs8.existsSync(flowFile) ? fs8.realpathSync(flowFile) : flowFile;
      } catch {
        realFlowFile = flowFile;
      }
      const isAllowed = allowedRoots.some((root) => {
        let realRoot;
        try {
          realRoot = fs8.realpathSync(root);
        } catch {
          realRoot = root;
        }
        const rel = path7.relative(realRoot, realFlowFile);
        return !rel.startsWith("..") && !path7.isAbsolute(rel);
      });
      if (!isAllowed) {
        return { type: "error", code: "FLOW_NOT_FOUND", message: "Flow file not found." };
      }
    }
    if (!fs8.existsSync(flowFile)) {
      this.logWriter.writeExecution("__parse", `FLOW_NOT_FOUND: ${flowFile}`, "info");
      return { type: "error", code: "FLOW_NOT_FOUND", message: "Flow file not found." };
    }
    let flow;
    try {
      const content = fs8.readFileSync(flowFile, "utf8");
      flow = load(content, { schema: JSON_SCHEMA });
    } catch (err) {
      this.logWriter.writeExecution("__parse", `PARSE_ERROR detail: ${String(err)}`, "error");
      return {
        type: "error",
        code: "PARSE_ERROR",
        message: "Flow file has a YAML syntax error. Run 'flow validate' for details."
      };
    }
    if (!flow || typeof flow !== "object") {
      return { type: "error", code: "PARSE_ERROR", message: "Flow file is empty or not a YAML object" };
    }
    const validator = new FlowValidator(void 0);
    const result = validator.validate(flow);
    if (!result.valid) {
      return {
        type: "error",
        code: "VALIDATION_FAILED",
        message: JSON.stringify(result.issues.filter((i) => i.severity === "error"))
      };
    }
    const interventionStep = flow.steps.find((s) => s.type === "user_intervention");
    if (interventionStep) {
      return {
        type: "error",
        code: "UNSUPPORTED_STEP_TYPE",
        message: `Step '${interventionStep.id}' is of type 'user_intervention' which is not supported in v1.`
      };
    }
    const subflowStep = flow.steps.find((s) => s.type === "subflow");
    if (subflowStep) {
      return {
        type: "error",
        code: "UNSUPPORTED_STEP_TYPE",
        message: `Step '${subflowStep.id}' is of type 'subflow' which is not supported in v1.`
      };
    }
    const flowId = cmd.flowId ?? flow.id;
    const executionId = generateExecutionId();
    let workspaceDir;
    let workspaceMetaDir;
    let pluginHandleEntry;
    let effectiveWorkspaceProvider = this.workspaceProvider;
    if (flow.plugins?.workspace && this.resolvePerFlowWorkspaceProvider) {
      try {
        effectiveWorkspaceProvider = await this.resolvePerFlowWorkspaceProvider(flow.plugins.workspace);
      } catch (err) {
        this.logWriter.writeExecution("__workspace", `PER_FLOW_WORKSPACE_ERROR: ${String(err)}`, "error");
        return {
          type: "error",
          code: "WORKSPACE_ERROR",
          message: `Failed to resolve per-flow workspace provider: ${String(err)}`
        };
      }
    }
    if (effectiveWorkspaceProvider) {
      let pluginHandle;
      try {
        pluginHandle = await effectiveWorkspaceProvider.allocate({ taskId: executionId });
      } catch (err) {
        this.logWriter.writeExecution("__workspace", `WORKSPACE_ERROR detail: ${String(err)}`, "error");
        return {
          type: "error",
          code: "WORKSPACE_ERROR",
          message: "Failed to allocate workspace via plugin provider."
        };
      }
      pluginHandleEntry = { handle: pluginHandle, provider: effectiveWorkspaceProvider };
      workspaceDir = pluginHandle.path;
      workspaceMetaDir = pluginHandle.path + ".meta";
      try {
        fs8.mkdirSync(path7.join(workspaceMetaDir, "outputs"), { recursive: true });
        this.pluginWorkspaceHandles.set(executionId, {
          handle: pluginHandle,
          provider: effectiveWorkspaceProvider
        });
      } catch (setupErr) {
        void pluginHandleEntry.provider.release(pluginHandleEntry.handle).catch((releaseErr) => {
          process.stderr.write(`[CommandHandler] Failed to release plugin workspace after setup error for ${executionId}: ${String(releaseErr)}
`);
        });
        throw setupErr;
      }
    } else {
      const workspaceManager = new WorkspaceManager(cmd.cwd);
      let workspace;
      try {
        workspace = await workspaceManager.allocate({
          taskId: executionId,
          config: flow.workspace,
          existingPath: cmd.cwd
        });
      } catch (err) {
        this.logWriter.writeExecution("__workspace", `WORKSPACE_ERROR detail: ${String(err)}`, "error");
        return {
          type: "error",
          code: "WORKSPACE_ERROR",
          message: "Failed to allocate workspace. Ensure the flow workspace directory is writable."
        };
      }
      workspaceDir = workspace.path;
      workspaceMetaDir = workspace.metaDir;
      this.nativeWorkspaceManagers.set(executionId, { manager: workspaceManager, workspaceId: workspace.id });
    }
    const stepIds = flow.steps.map((s) => s.id);
    try {
      this.executionStore.create({ executionId, flowFile, flowId, stepIds });
    } catch (err) {
      if (pluginHandleEntry) {
        this.pluginWorkspaceHandles.delete(executionId);
        void pluginHandleEntry.provider.release(pluginHandleEntry.handle).catch((releaseErr) => {
          process.stderr.write(`[CommandHandler] Failed to release workspace after setup error for ${executionId}: ${String(releaseErr)}
`);
        });
      }
      throw err;
    }
    const context = {
      executionId,
      inputs: cmd.inputs ?? {},
      stepOutputs: {},
      stepMeta: {},
      workspaceDir,
      outputsDir: workspaceMetaDir + "/outputs",
      cwd: cmd.cwd
    };
    const schedulerCtx = {
      inputs: context.inputs,
      stepOutputs: /* @__PURE__ */ new Map()
    };
    let resolvedGlobalEnv;
    if (flow.env) {
      const templateRenderer = new TemplateRenderer();
      const templateCtx = {
        inputs: context.inputs,
        stepOutputs: /* @__PURE__ */ new Map(),
        taskMetadata: {},
        context: { cwd: cmd.cwd, projectDir: cmd.cwd, workspaceDir }
      };
      resolvedGlobalEnv = Object.fromEntries(Object.entries(flow.env).map(([k, v]) => [
        k,
        templateRenderer.render(v, templateCtx, false)
      ]));
    }
    const depends = new Map(flow.steps.map((s) => [s.id, s.depends ?? []]));
    const assignable = (resolvedGlobalEnv ? flow.steps.map((s) => s.type === "script" ? {
      ...s,
      env: {
        ...resolvedGlobalEnv,
        ...s.env ?? {}
      }
    } : s) : flow.steps).filter((s) => s.type === "model" || s.type === "script");
    const scheduler = new FlowScheduler(schedulerCtx);
    const readyItems = scheduler.start(assignable, depends);
    this.schedulers.set(executionId, scheduler);
    this.executionContexts.set(executionId, context);
    this.parentChildIndex.set(executionId, { parentToChildren: /* @__PURE__ */ new Map(), childToParent: /* @__PURE__ */ new Map() });
    this.stepCounts.set(executionId, assignable.length);
    this.activeExecutionCount++;
    if (hookDispatcher)
      this.executionHooks.set(executionId, hookDispatcher);
    this.enqueueReadyItems(executionId, readyItems, context);
    this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
    this.dispatchHook(executionId, "onFlowStart", { executionId, flowId, flowFile });
    this.tryDispatch();
    return { type: "execution_started", executionId };
  }
  /** Called by Daemon when a worker reports step_completed. */
  onStepCompleted(executionId, stepId, output, meta) {
    const scheduler = this.schedulers.get(executionId);
    if (!scheduler) {
      process.stderr.write(`[CommandHandler] onStepCompleted: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup
`);
      return;
    }
    const context = this.executionContexts.get(executionId);
    context.stepOutputs[stepId] = output;
    if (meta)
      context.stepMeta[stepId] = meta;
    const newReady = scheduler.complete(stepId, { type: "completed", outputs: output });
    if (scheduler.isTerminal()) {
      this.markSkippedStepsCompleted(executionId);
      this.cleanupExecution(executionId);
    } else {
      this.enqueueReadyItems(executionId, newReady, context);
    }
  }
  /** Called by Daemon when a worker reports step_failed. */
  onStepFailed(executionId, stepId, error) {
    const scheduler = this.schedulers.get(executionId);
    if (!scheduler) {
      process.stderr.write(`[CommandHandler] onStepFailed: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup
`);
      return;
    }
    const context = this.executionContexts.get(executionId);
    const newReady = scheduler.complete(stepId, { type: "failed", error });
    if (scheduler.hasFailed()) {
      for (let i = this.readyQueue.length - 1; i >= 0; i--) {
        if (this.readyQueue[i].executionContext.executionId === executionId) {
          this.readyQueue.splice(i, 1);
        }
      }
      this.executionStore.markExecutionFailed(executionId);
      this.cleanupExecution(executionId, new Error(error));
    } else {
      this.enqueueReadyItems(executionId, newReady, context);
      this.tryDispatch();
    }
  }
  /** Called by Daemon for inject_steps messages. */
  injectSteps(executionId, injectedSteps) {
    const scheduler = this.schedulers.get(executionId);
    if (!scheduler) {
      throw new Error(`No active execution found for id: ${executionId}`);
    }
    const currentCount = this.stepCounts.get(executionId) ?? 0;
    const totalAfterInject = currentCount + injectedSteps.length;
    if (injectedSteps.length > this.maxInjectedSteps) {
      throw new Error(`provideSteps: ${injectedSteps.length} steps exceeds per-call limit of ${this.maxInjectedSteps}`);
    }
    if (totalAfterInject > this.maxStepsPerExecution) {
      throw new Error(`Execution ${executionId} would exceed max steps per execution (${this.maxStepsPerExecution}) after injection`);
    }
    const meta = this.parentChildIndex.get(executionId);
    const allKnownIds = /* @__PURE__ */ new Set([...this.getKnownStepIds(executionId), ...injectedSteps.map((s) => s.id)]);
    for (const injected of injectedSteps) {
      if (this.isKnownStepId(executionId, injected.id)) {
        throw new Error(`Step id '${injected.id}' already exists in execution ${executionId}`);
      }
      if (injected.parent !== void 0 && !allKnownIds.has(injected.parent)) {
        throw new Error(`Parent step '${injected.parent}' does not exist in execution ${executionId}`);
      }
      if (injected.depends) {
        for (const dep of injected.depends) {
          if (!allKnownIds.has(dep)) {
            throw new Error(`Dependency step '${dep}' does not exist in execution ${executionId}`);
          }
        }
      }
    }
    for (const injected of injectedSteps) {
      if (injected.parent !== void 0) {
        if (!meta.parentToChildren.has(injected.parent)) {
          meta.parentToChildren.set(injected.parent, /* @__PURE__ */ new Set());
        }
        meta.parentToChildren.get(injected.parent).add(injected.id);
        meta.childToParent.set(injected.id, injected.parent);
      }
    }
    this.stepCounts.set(executionId, totalAfterInject);
    const context = this.executionContexts.get(executionId);
    const newReady = scheduler.inject(injectedSteps);
    this.enqueueReadyItems(executionId, newReady, context);
  }
  tryDispatch() {
    while (this.readyQueue.length > 0) {
      const idleWorker = this.workerPool.getIdleWorker();
      if (idleWorker) {
        const step = this.readyQueue.shift();
        const scheduler = this.schedulers.get(step.executionContext.executionId);
        this.workerPool.markBusy(idleWorker);
        scheduler?.acknowledge(step.stepId);
        this.executionStore.markStepRunning(step.executionContext.executionId, step.stepId);
        this.dispatchHook(step.executionContext.executionId, "onStepStart", {
          executionId: step.executionContext.executionId,
          stepId: step.stepId
        });
        const sent = this.workerPool.sendToWorker(idleWorker, {
          type: "assign",
          stepId: step.stepId,
          stepConfig: step.stepConfig,
          executionContext: step.executionContext
        });
        if (!sent) {
          this.workerPool.removeWorker(idleWorker);
          scheduler?.unacknowledge(step.stepId);
          this.readyQueue.unshift(step);
          continue;
        }
      } else if (this.workerPool.canSpawn()) {
        this.workerPool.spawnWorker();
        break;
      } else {
        break;
      }
    }
  }
  enqueueReadyItems(executionId, items, context) {
    for (const item of items) {
      this.readyQueue.push({
        stepId: item.stepId,
        stepConfig: item.step,
        executionContext: context
      });
    }
  }
  markSkippedStepsCompleted(executionId) {
    if (!this.executionStore.exists(executionId))
      return;
    const state = this.executionStore.read(executionId);
    for (const [sid, stepState] of Object.entries(state.steps)) {
      if (stepState.status === "pending") {
        this.executionStore.markStepCompleted(executionId, sid);
      }
    }
  }
  cleanupExecution(executionId, priorError) {
    this.schedulers.delete(executionId);
    this.executionContexts.delete(executionId);
    this.parentChildIndex.delete(executionId);
    this.stepCounts.delete(executionId);
    this.activeExecutionCount--;
    const pluginWs = this.pluginWorkspaceHandles.get(executionId);
    if (pluginWs) {
      this.pluginWorkspaceHandles.delete(executionId);
      void releaseWorkspace(pluginWs.provider, pluginWs.handle, priorError).catch((err) => {
        process.stderr.write(`[CommandHandler] Failed to release plugin workspace for ${executionId}: ${String(err)}
`);
      });
    }
    const nativeWs = this.nativeWorkspaceManagers.get(executionId);
    if (nativeWs) {
      this.nativeWorkspaceManagers.delete(executionId);
      void nativeWs.manager.release(nativeWs.workspaceId, executionId).catch((err) => {
        process.stderr.write(`[CommandHandler] Failed to release workspace for ${executionId}: ${String(err)}
`);
      });
    }
  }
  /** Returns all known step IDs for an execution (initial + injected so far). */
  getKnownStepIds(executionId) {
    return this.schedulers.get(executionId)?.getStepIds() ?? /* @__PURE__ */ new Set();
  }
  isKnownStepId(executionId, stepId) {
    return this.getKnownStepIds(executionId).has(stepId);
  }
};

// dist/daemon/WebSocketServer.js
var http2 = __toESM(require("node:http"), 1);

// ../../node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// dist/daemon/WebSocketServer.js
var WebSocketServer2 = class {
  onMessage;
  onClose;
  wss;
  httpServer;
  _port;
  constructor(port, onMessage, onClose) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this._port = port;
    this.httpServer = http2.createServer();
    this.wss = new import_websocket_server.default({ server: this.httpServer, maxPayload: 1024 * 1024 });
    this.wss.on("connection", (ws) => this.handleConnection(ws));
  }
  /** Bind to the requested port, retrying up to 10 increments on EADDRINUSE (e.g. TIME_WAIT). */
  start() {
    return new Promise((resolve4, reject) => {
      const tryBind = (p, attemptsLeft) => {
        this.httpServer.once("error", (err) => {
          if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
            tryBind(p + 1, attemptsLeft - 1);
          } else {
            reject(err);
          }
        });
        this.httpServer.once("listening", () => {
          this._port = p;
          resolve4(p);
        });
        this.httpServer.listen(p, "127.0.0.1");
      };
      tryBind(this._port, 10);
    });
  }
  get port() {
    return this._port;
  }
  handleConnection(ws) {
    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.onMessage(ws, message);
    });
    ws.on("close", () => this.onClose(ws));
    ws.on("error", (err) => {
      process.stderr.write(`[WebSocketServer] connection error: ${err.message}
`);
      ws.terminate();
    });
  }
  close() {
    this.wss.close();
    this.httpServer.close();
  }
};

// dist/daemon/WorkerPool.js
var import_node_child_process2 = require("node:child_process");
var import_node_url2 = require("node:url");
var WORKER_CONNECT_TIMEOUT_MS = 1e4;
var WorkerPool = class {
  concurrencyLimit;
  httpPort;
  wsPortOrGetter;
  workers = /* @__PURE__ */ new Map();
  // Maps worker PID → pending connect timeout handle.
  // Cleared when the worker sends its first 'ready' message (via registerWorker).
  pendingConnectTimeouts = /* @__PURE__ */ new Map();
  // PIDs of processes spawned by this pool. Used to reject registration from external processes.
  spawnedPids = /* @__PURE__ */ new Set();
  activeCount = 0;
  workerPath;
  claudePath;
  tsxLoaderPath;
  constructor(concurrencyLimit, httpPort, wsPortOrGetter, claudePath) {
    this.concurrencyLimit = concurrencyLimit;
    this.httpPort = httpPort;
    this.wsPortOrGetter = wsPortOrGetter;
    this.workerPath = (0, import_node_url2.fileURLToPath)(new URL("../../dist/worker/Worker.js", __importMetaUrl));
    this.claudePath = claudePath ?? "";
    this.tsxLoaderPath = new URL("../../../../node_modules/tsx/dist/loader.mjs", __importMetaUrl).href;
  }
  canSpawn() {
    return this.activeCount < this.concurrencyLimit;
  }
  spawnWorker() {
    this.activeCount++;
    const child = (0, import_node_child_process2.spawn)(process.execPath, ["--import", this.tsxLoaderPath, this.workerPath], {
      env: {
        // IPC: worker needs to know daemon location
        FLOW_DAEMON_PORT: String(this.httpPort),
        FLOW_WS_PORT: String(typeof this.wsPortOrGetter === "function" ? this.wsPortOrGetter() : this.wsPortOrGetter),
        // Claude binary path resolved at daemon startup — avoids PATH dependency in worker
        ...this.claudePath ? { FLOW_CLAUDE_PATH: this.claudePath } : {},
        // PATH: needed for standard tools in script steps and shell resolution
        ...process.env["PATH"] ? { PATH: process.env["PATH"] } : {},
        // HOME: needed by many tools and claude config lookup
        ...process.env["HOME"] ? { HOME: process.env["HOME"] } : {},
        // ANTHROPIC_API_KEY: required for model steps — passed explicitly, not via spread
        ...process.env["ANTHROPIC_API_KEY"] ? { ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"] } : {},
        // Windows-specific vars required for subprocess and temp file resolution
        ...process.platform === "win32" && process.env["SystemRoot"] ? { SystemRoot: process.env["SystemRoot"] } : {},
        ...process.platform === "win32" && process.env["USERPROFILE"] ? { USERPROFILE: process.env["USERPROFILE"] } : {},
        ...process.env["TEMP"] ? { TEMP: process.env["TEMP"] } : {},
        ...process.env["TMP"] ? { TMP: process.env["TMP"] } : {}
      },
      detached: false,
      stdio: ["ignore", "ignore", "pipe"]
    });
    if (child.pid === void 0) {
      this.activeCount--;
      process.stderr.write("[WorkerPool] spawn produced no PID \u2014 aborting worker\n");
      return;
    }
    const pid = child.pid;
    this.spawnedPids.add(pid);
    const connectTimeout = setTimeout(() => {
      this.pendingConnectTimeouts.delete(pid);
      if (!child.killed) {
        process.stderr.write(`[worker] pid ${String(pid)} did not connect within ${WORKER_CONNECT_TIMEOUT_MS}ms \u2014 killing
`);
        child.kill("SIGKILL");
      }
    }, WORKER_CONNECT_TIMEOUT_MS);
    this.pendingConnectTimeouts.set(pid, connectTimeout);
    child.on("exit", () => {
      clearTimeout(connectTimeout);
      this.pendingConnectTimeouts.delete(pid);
      this.spawnedPids.delete(pid);
      this.activeCount = Math.max(0, this.activeCount - 1);
    });
    child.stderr?.on("data", (data) => {
      process.stderr.write(`[worker] ${data.toString()}`);
    });
  }
  registerWorker(ws, pid) {
    if (!this.spawnedPids.has(pid)) {
      process.stderr.write(`[WorkerPool] rejected registration from unknown PID ${String(pid)}
`);
      ws.terminate();
      return;
    }
    const timer = this.pendingConnectTimeouts.get(pid);
    if (timer !== void 0) {
      clearTimeout(timer);
      this.pendingConnectTimeouts.delete(pid);
    }
    this.workers.set(ws, "idle");
  }
  removeWorker(ws) {
    this.workers.delete(ws);
  }
  getIdleWorker() {
    for (const [ws, state] of this.workers) {
      if (state === "idle")
        return ws;
    }
    return void 0;
  }
  markBusy(ws) {
    this.workers.set(ws, "busy");
  }
  markIdle(ws) {
    this.workers.set(ws, "idle");
  }
  hasActiveWorkers() {
    return [...this.workers.values()].some((s) => s === "busy");
  }
  sendToWorker(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  broadcastDone() {
    for (const [ws] of this.workers) {
      this.sendToWorker(ws, { type: "done" });
    }
  }
};

// dist/daemon/Daemon.js
function resolveClaudePath() {
  try {
    const cmd = process.platform === "win32" ? "where.exe claude" : "which claude";
    const result = (0, import_node_child_process3.execSync)(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return result.trim().split("\n")[0]?.trim() ?? "";
  } catch {
    process.stderr.write("[daemon] Warning: claude binary not found on PATH. Model steps may fail.\n");
    return "";
  }
}
function loadFlowHooks(cwd) {
  const configPath = path8.join(cwd, ".flows", "config.yml");
  if (!fs9.existsSync(configPath))
    return {};
  try {
    const raw = load(fs9.readFileSync(configPath, "utf8"), { schema: JSON_SCHEMA });
    return raw["hooks"] ?? {};
  } catch (err) {
    process.stderr.write(`[daemon] Failed to parse .flows/config.yml: ${String(err)}
`);
    return {};
  }
}
async function tryResolvePlugins() {
  const globalConfigPath = path8.join(os3.homedir(), ".flow", "config.yml");
  const projectConfigPath = path8.join(process.cwd(), ".flow", "config.yml");
  const envOverride = process.env["FLOW_CONFIG"];
  if (!envOverride && !fs9.existsSync(globalConfigPath) && !fs9.existsSync(projectConfigPath)) {
    return {};
  }
  return resolvePlugins();
}
async function startDaemon(config = DEFAULT_CONFIG, daemonDir) {
  const resolvedDaemonDir = daemonDir ?? path8.join(os3.homedir(), ".flow-daemon");
  const executionsDir = path8.join(resolvedDaemonDir, "executions");
  const logsDir = path8.join(resolvedDaemonDir, "logs");
  const pluginProviders = await tryResolvePlugins();
  const perFlowWorkspaceResolver = await createPerFlowWorkspaceResolver();
  let workerPool;
  let wsServer;
  let commandHandler;
  let executionStore;
  let logWriter;
  fs9.mkdirSync(resolvedDaemonDir, { recursive: true, mode: 448 });
  const daemonHandle = await (0, import_singleton_daemon_kit.createDaemon)({
    configDir: resolvedDaemonDir,
    idleTimeout: null,
    commands: {
      run: async (payload) => {
        const cmd = payload;
        const flowHooks = loadFlowHooks(cmd.cwd);
        return commandHandler.handleRun(cmd, new HookDispatcher(flowHooks));
      }
    },
    hooks: {
      onStart: (port) => {
        fs9.mkdirSync(executionsDir, { recursive: true, mode: 448 });
        fs9.mkdirSync(logsDir, { recursive: true, mode: 448 });
        const wsPort = config.worker.wsPort ?? port + 1;
        executionStore = new ExecutionStore(executionsDir, config.logs.retainDays);
        logWriter = new LogWriter(logsDir, config.logs.retainDays);
        executionStore.pruneOldExecutions();
        WorkspaceManager.pruneOldWorkspaceDir(path8.join(process.cwd(), ".agent-fleet", "workspaces"), config.workspace.retainDays, config.workspace.maxWorkspaces);
        const claudePath = resolveClaudePath();
        wsServer = new WebSocketServer2(wsPort, handleWorkerMessage, handleWorkerClose);
        wsServer.start().catch((err) => {
          process.stderr.write(`[daemon] WebSocket server failed to start: ${err.message}
`);
        });
        workerPool = new WorkerPool(config.queue.concurrency, port, () => wsServer.port, claudePath);
        commandHandler = new CommandHandler(resolvedDaemonDir, workerPool, void 0, executionStore, logWriter, config.security.allowAbsolutePaths, config.limits.maxInjectedSteps, config.limits.maxStepsPerExecution, pluginProviders.workspaceProvider, pluginProviders.approvalProvider, perFlowWorkspaceResolver);
      }
    }
  });
  function handleWorkerMessage(ws, message) {
    switch (message.type) {
      case "ready": {
        workerPool.registerWorker(ws, message.pid);
        commandHandler.tryDispatch();
        checkShutdown();
        break;
      }
      case "step_completed": {
        try {
          const { executionId, stepId, output, meta } = message;
          executionStore.markStepCompleted(executionId, stepId);
          commandHandler.onStepCompleted(executionId, stepId, output, meta);
          logWriter.writeExecution(executionId, `Step ${stepId} completed`);
          commandHandler.dispatchHook(executionId, "onStepEnd", { executionId, stepId });
          const state = executionStore.read(executionId);
          const allDone = Object.values(state.steps).every((s) => s.status === "completed" || s.status === "failed");
          if (allDone) {
            if (Object.values(state.steps).every((s) => s.status === "completed")) {
              executionStore.markExecutionCompleted(executionId);
              logWriter.writeExecution(executionId, `Execution completed`);
              commandHandler.dispatchHook(executionId, "onFlowEnd", { executionId });
            } else {
              executionStore.markExecutionFailed(executionId);
              logWriter.writeExecution(executionId, `Execution failed`, "error");
              commandHandler.dispatchHook(executionId, "onFlowError", { executionId });
            }
            commandHandler.removeExecutionHooks(executionId);
          }
          commandHandler.tryDispatch();
        } catch (err) {
          process.stderr.write(`[daemon] step_completed handler error: ${String(err)}
`);
        }
        break;
      }
      case "step_failed": {
        try {
          const { executionId, stepId, error } = message;
          executionStore.markStepFailed(executionId, stepId, error);
          commandHandler.onStepFailed(executionId, stepId, error);
          logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, "error");
          commandHandler.dispatchHook(executionId, "onStepFailed", { executionId, stepId, error });
        } catch (err) {
          process.stderr.write(`[daemon] step_failed handler error: ${String(err)}
`);
        }
        break;
      }
      case "log": {
        try {
          const { executionId, stepId, entry } = message;
          logWriter.write(executionId, stepId, entry);
        } catch (err) {
          process.stderr.write(`[daemon] log handler error: ${String(err)}
`);
        }
        break;
      }
      case "inject_steps": {
        const { executionId, steps } = message;
        try {
          commandHandler.injectSteps(executionId, steps);
          const current = executionStore.read(executionId);
          const newSteps = { ...current.steps };
          for (const s of steps) {
            newSteps[s.id] = { status: "pending", injected: true };
          }
          executionStore.update(executionId, { steps: newSteps });
          commandHandler.tryDispatch();
        } catch (err) {
          logWriter.writeExecution(executionId, `Failed to inject steps: ${String(err)}`, "error");
        }
        break;
      }
      default: {
        const _exhaustive = message;
        throw new Error(`Unknown worker message type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  function handleWorkerClose(ws) {
    workerPool.removeWorker(ws);
    checkShutdown();
  }
  function checkShutdown() {
    if (commandHandler.isQueueEmpty() && !commandHandler.hasActiveExecutions() && !workerPool.hasActiveWorkers()) {
      workerPool.broadcastDone();
      wsServer.close();
      void daemonHandle.stop("idle");
    }
  }
  return daemonHandle;
}

// dist/cli/commands/RunCommand.js
function parseTimeout(value) {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
  if (!match)
    throw new Error(`Invalid timeout: ${value}. Use e.g. 10m, 30s, 5000ms`);
  const n = parseInt(match[1], 10);
  switch (match[2] ?? "s") {
    case "ms":
      return n;
    case "s":
      return n * 1e3;
    case "m":
      return n * 60 * 1e3;
    case "h":
      return n * 3600 * 1e3;
    default:
      throw new Error(`Unknown time unit`);
  }
}
function tailLogFile(logFile, executionId, lastByte, onLog) {
  if (!fs10.existsSync(logFile))
    return lastByte;
  const stat = fs10.statSync(logFile);
  if (stat.size <= lastByte)
    return lastByte;
  const buf = Buffer.alloc(stat.size - lastByte);
  const fd = fs10.openSync(logFile, "r");
  fs10.readSync(fd, buf, 0, buf.length, lastByte);
  fs10.closeSync(fd);
  const chunk = buf.toString("utf8");
  const lines = chunk.split("\n");
  for (const raw of lines) {
    const trimmed2 = raw.trim();
    if (!trimmed2)
      continue;
    let line;
    try {
      line = JSON.parse(trimmed2);
    } catch {
      continue;
    }
    const prefix = `[${executionId}|`;
    if (!line.prefix.startsWith(prefix))
      continue;
    const stepId = line.prefix.slice(prefix.length, -1);
    if (stepId === "__execution")
      continue;
    onLog(stepId, line.message);
  }
  return stat.size;
}
async function waitForCompletion(executionId, daemonDir, timeoutMs, onLog, options) {
  const store = new ExecutionStore(path9.join(daemonDir, "executions"));
  const logFile = path9.join(daemonDir, "logs", `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.ndjson`);
  const deadline = Date.now() + timeoutMs;
  let delay2 = options?.fastPoll ? 50 : 200;
  let lastByte = 0;
  while (Date.now() < deadline) {
    if (onLog) {
      lastByte = tailLogFile(logFile, executionId, lastByte, onLog);
    }
    if (store.exists(executionId)) {
      const state = store.read(executionId);
      if (state.status === "completed" || state.status === "failed") {
        if (onLog)
          tailLogFile(logFile, executionId, lastByte, onLog);
        return state;
      }
    }
    await new Promise((r) => setTimeout(r, delay2));
    if (!options?.fastPoll)
      delay2 = Math.min(delay2 * 1.5, 2e3);
  }
  throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}
function findProjectRoot(startDir) {
  let dir = path9.resolve(startDir);
  const { root } = path9.parse(dir);
  while (dir !== root) {
    if (fs10.existsSync(path9.join(dir, ".agent-fleet")))
      return dir;
    dir = path9.dirname(dir);
  }
  return null;
}
function resolveFlowFile(flowRef, cwd) {
  const resolvedPath = path9.isAbsolute(flowRef) ? flowRef : path9.resolve(cwd, flowRef);
  if (fs10.existsSync(resolvedPath)) {
    return { found: true, flowFile: resolvedPath };
  }
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) {
    return { found: false, error: `Flow '${flowRef}' not found as a file and no .agent-fleet/ directory found.` };
  }
  const flowsFile = path9.join(projectRoot, ".agent-fleet", "flows.yml");
  if (!fs10.existsSync(flowsFile)) {
    return { found: false, error: `Flow '${flowRef}' not found and no flows.yml in ${projectRoot}` };
  }
  return { found: true, flowFile: flowsFile, inferredFlowId: flowRef };
}
function validateSecretInputs(flowFilePath, inputs) {
  let flow;
  try {
    const content = fs10.readFileSync(flowFilePath, "utf8");
    flow = load(content, { schema: JSON_SCHEMA });
  } catch {
    return null;
  }
  if (!flow?.inputs)
    return null;
  for (const [key, spec] of Object.entries(flow.inputs)) {
    const inputType = typeof spec === "string" ? spec : spec.type;
    if (inputType !== "password")
      continue;
    const value = inputs[key];
    if (value === void 0)
      continue;
    const isUriScheme = value.startsWith("env://") || value.startsWith("file://") || value.startsWith("input://");
    if (!isUriScheme) {
      return `Input '${key}' is of type '${inputType}' but received a literal value. Use a URI scheme instead: env://VAR_NAME, file://./path, or input://name.`;
    }
  }
  return null;
}
function parseInputArgs(rawInputs) {
  const inputs = {};
  for (const entry of rawInputs) {
    const idx = entry.indexOf("=");
    if (idx === -1) {
      console.error(`Invalid input: '${entry}'. Use key=value`);
      process.exit(1);
    }
    inputs[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
  return inputs;
}
async function sendToDaemon(cmd, config, daemonDir) {
  const makeClient = () => (0, import_singleton_daemon_kit2.createDaemonClient)({
    configDir: daemonDir,
    commands: {}
  });
  try {
    return await makeClient().send("run", cmd);
  } catch (err) {
    if (!(err instanceof import_singleton_daemon_kit2.DaemonNotRunningError))
      throw err;
    try {
      await startDaemon(config);
      return await makeClient().send("run", cmd);
    } catch (e2) {
      console.error("Daemon could not be started:", e2);
      process.exit(3);
    }
  }
}
function registerRunCommand(program2) {
  program2.command("run <flowRef>").description("Run a flow by file path or flow ID").option("-i, --input <key=value>", "Input key=value (repeatable)", (val, acc) => {
    acc.push(val);
    return acc;
  }, []).option("--inputs <key=value>", "Alias for --input (repeatable)", (val, acc) => {
    acc.push(val);
    return acc;
  }, []).option("--flow-id <id>", "Flow ID within a multi-flow YAML").option("--wait", "Block until execution completes").option("--timeout <duration>", "Timeout for --wait (default: 10m)", "10m").option("--quiet", "Suppress output").option("--json", "Machine-readable output").option("--human", "Force human-readable output").action(async (flowRef, options) => {
    const inputs = parseInputArgs([...options.input, ...options.inputs]);
    const cwd = process.cwd();
    const daemonDir = path9.join(os4.homedir(), ".flow-daemon");
    const resolution = resolveFlowFile(flowRef, cwd);
    if (!resolution.found) {
      console.error(resolution.error);
      process.exit(1);
    }
    const { flowFile, inferredFlowId } = resolution;
    const flowId = options.flowId ?? inferredFlowId;
    if (fs10.existsSync(flowFile)) {
      const secretError = validateSecretInputs(flowFile, inputs);
      if (secretError) {
        console.error(`Error:${secretError}`);
        process.exit(2);
      }
    }
    const config = loadFlowConfig(path9.join(os4.homedir(), ".flow-config.yaml"));
    const cmd = {
      type: "run",
      flowFile,
      flowId,
      inputs,
      quiet: options.quiet,
      cwd
    };
    let response;
    try {
      response = await sendToDaemon(cmd, config, daemonDir);
    } catch (err) {
      console.error("Failed to contact the daemon.");
      process.exit(1);
    }
    if (response.type === "error") {
      if (options.json && !options.human) {
        process.stderr.write(JSON.stringify({ code: response.code, message: response.message }) + "\n");
      } else {
        console.error(`Error:${response.message}`);
      }
      process.exit(response.code === "VALIDATION_FAILED" ? 2 : 1);
    }
    const { executionId } = response;
    if (!executionId) {
      console.error("Error: daemon returned a response without an executionId \u2014 try restarting the daemon");
      process.exit(1);
    }
    if (!options.wait) {
      if (options.json && !options.human) {
        process.stdout.write(JSON.stringify({ executionId }) + "\n");
      } else if (!options.quiet) {
        console.log(executionId);
      }
      process.exit(0);
    }
    const timeoutMs = parseTimeout(options.timeout);
    const start = Date.now();
    const logCallback = !options.quiet && !(options.json && !options.human) ? (stepId, message) => {
      const ts = (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
      process.stdout.write(`[${ts}] [${stepId}] ${message}
`);
    } : void 0;
    const flowYaml = fs10.existsSync(flowFile) ? (() => {
      try {
        return load(fs10.readFileSync(flowFile, "utf8"), {
          schema: JSON_SCHEMA
        });
      } catch {
        return null;
      }
    })() : null;
    const fastPoll = Array.isArray(flowYaml?.steps) ? flowYaml.steps.some((s) => s.log === "streaming" || s.log === "polling") : false;
    let finalState;
    try {
      finalState = await waitForCompletion(executionId, daemonDir, timeoutMs, logCallback, { fastPoll });
    } catch (err) {
      if (options.json && !options.human) {
        process.stderr.write(JSON.stringify({ error: "execution_timeout", executionId }) + "\n");
      } else {
        console.error("Error:Execution timed out.");
      }
      process.exit(124);
    }
    const durationMs = Date.now() - start;
    if (options.json && !options.human) {
      const stepOutputs2 = {};
      process.stdout.write(JSON.stringify({ executionId, status: finalState.status, outputs: stepOutputs2, durationMs }) + "\n");
    } else {
      if (finalState.status === "completed") {
        console.log(`Flow completed in ${durationMs}ms`);
      } else {
        const reason = finalState.lastError ? ` \u2014 ${finalState.lastError}` : "";
        console.error(`Error:Flow failed${reason}`);
        process.exit(1);
      }
    }
    process.exit(0);
  });
}

// dist/utils/loadYaml.js
var fs11 = __toESM(require("fs"), 1);
function loadYaml(file) {
  if (!fs11.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  try {
    const content = fs11.readFileSync(file, "utf-8");
    const raw = load(content, { schema: JSON_SCHEMA });
    if (raw === null || raw === void 0) {
      console.error(`File is empty: ${file}`);
      process.exit(1);
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      console.error(`Invalid flow: expected a YAML object, got ${Array.isArray(raw) ? "array" : typeof raw} in ${file}`);
      process.exit(1);
    }
    return raw;
  } catch (err) {
    console.error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// dist/cli/commands/ShowCommand.js
function pad2(s, width) {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function stepType(step) {
  if (step.type === "model")
    return step.model;
  if (step.type === "script")
    return "script";
  if (step.type === "subflow")
    return `subflow:${step.flowId}`;
  if (step.type === "user_intervention") {
    const s = step;
    return s.interventionType;
  }
  throw new Error(`Unknown step type: ${step.type}`);
}
function shortWhen(expr) {
  const clean = expr.replace(/\$\{\{|\}\}/g, "").trim();
  const simplified = clean.replace(/steps\.[^.]+\.outputs\./g, "");
  return simplified.length > 30 ? simplified.slice(0, 28) + ".." : simplified;
}
function stepDepends(step, steps) {
  if (!step.depends || step.depends.length === 0)
    return "-";
  const nums = step.depends.map((depId) => {
    const idx = steps.findIndex((s) => s.id === depId) + 1;
    return idx > 0 ? String(idx) : depId;
  });
  if (!step.when)
    return nums.join(", ");
  const cond = shortWhen(step.when);
  return `${nums.join(", ")}: if(${cond})`;
}
function stepOutputs(step) {
  if (!step.output)
    return "-";
  const keys = Object.keys(step.output);
  return keys.length > 0 ? keys.join(", ") : "-";
}
function stepLoop(step, steps) {
  if (!step.onFailure?.goto)
    return "";
  const targetIdx = steps.findIndex((s) => s.id === step.onFailure.goto) + 1;
  const target = targetIdx > 0 ? String(targetIdx) : step.onFailure.goto;
  const max = step.onFailure.maxIterations != null ? `  max:${step.onFailure.maxIterations}x` : "";
  return `  err -> ${target}${max}`;
}
function stepRetry(step) {
  if (!step.retry)
    return "";
  return `  retry:${step.retry.maxAttempts}x`;
}
function isBlocking(step) {
  return step.type === "user_intervention" && step.blocking !== false;
}
function formatInputs(inputs) {
  if (!inputs || Object.keys(inputs).length === 0)
    return "(none)";
  return Object.entries(inputs).map(([name, spec]) => {
    if (typeof spec === "string")
      return `${name} (${spec})`;
    const s = spec;
    const type2 = s.type ?? "string";
    const req = s.required === false ? "" : ", required";
    const def = s.default !== void 0 ? `, default: ${String(s.default)}` : "";
    return `${name} (${type2}${req}${def})`;
  }).join("   ");
}
function formatStatus(flow) {
  if (!flow.statusTransitions)
    return "";
  const ok = typeof flow.statusTransitions.onSuccess === "string" ? flow.statusTransitions.onSuccess : flow.statusTransitions.onSuccess.task ?? "?";
  const fail = typeof flow.statusTransitions.onFailure === "string" ? flow.statusTransitions.onFailure : flow.statusTransitions.onFailure.task ?? "?";
  return `ok -> ${ok}   fail -> ${fail}`;
}
function formatTrigger(flow) {
  if (!flow.trigger)
    return "";
  if (flow.trigger.type === "event") {
    const filter = flow.trigger.filter ? " " + Object.entries(flow.trigger.filter).map(([k, v]) => `${k}=${v}`).join(", ") : "";
    return `trigger: event:${flow.trigger.event}${filter}`;
  }
  return "";
}
function renderFlow(flow) {
  const steps = flow.steps;
  console.log("");
  console.log(`${flow.id}  v${flow.version}`);
  console.log(flow.name);
  if (flow.description && flow.description !== flow.name) {
    console.log(flow.description);
  }
  const ws = flow.workspace;
  const wsParts = [ws.mode];
  if (ws.gitStrategy)
    wsParts.push(`git:${ws.gitStrategy}`);
  if (ws.reusePolicy)
    wsParts.push(`reuse:${ws.reusePolicy}`);
  console.log(`workspace: ${wsParts.join("  ")}`);
  console.log(`inputs:    ${formatInputs(flow.inputs)}`);
  const status = formatStatus(flow);
  if (status)
    console.log(`status:    ${status}`);
  const trigger = formatTrigger(flow);
  if (trigger)
    console.log(trigger);
  const COL_NUM = 3;
  const COL_ID = Math.min(30, Math.max(12, ...steps.map((s) => s.id.length + (isBlocking(s) ? 4 : 0)))) + 2;
  const COL_TYPE = Math.min(20, Math.max(10, ...steps.map((s) => stepType(s).length))) + 2;
  const COL_DEPENDS = Math.min(36, Math.max(7, ...steps.map((s) => stepDepends(s, steps).length))) + 2;
  const COL_OUTPUTS = 30;
  const TOTAL = COL_NUM + COL_ID + COL_TYPE + COL_DEPENDS + COL_OUTPUTS;
  const separator = "-".repeat(TOTAL);
  console.log(separator);
  console.log(" " + pad2("#", COL_NUM) + pad2("ID", COL_ID) + pad2("TYPE", COL_TYPE) + pad2("DEPENDS", COL_DEPENDS) + "OUTPUTS");
  console.log(separator);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const num = String(i + 1);
    const id = step.id + (isBlocking(step) ? " (!)" : "");
    const type2 = stepType(step);
    const depends = stepDepends(step, steps);
    const outputs = stepOutputs(step);
    const loop = stepLoop(step, steps);
    const retry = stepRetry(step);
    console.log(" " + pad2(num, COL_NUM) + pad2(id, COL_ID) + pad2(type2, COL_TYPE) + pad2(depends, COL_DEPENDS) + outputs + loop + retry);
  }
  console.log(separator);
  const counts = {};
  for (const step of steps) {
    const t = step.type === "model" ? step.model : step.type;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}`).join("   ");
  console.log(`  ${steps.length} steps:  ${summary}`);
  console.log("");
}
function registerShowCommand(program2) {
  program2.command("show <file>").description("Display a summary of a flow YAML file").action((file) => {
    const raw = loadYaml(file);
    const flow = raw;
    if (!Array.isArray(flow.steps) || !flow.workspace) {
      console.error(`Invalid flow: missing required fields 'steps' or 'workspace' in ${file}`);
      process.exit(1);
    }
    renderFlow(flow);
  });
}

// dist/validation/FlowFileValidator.js
var fs12 = __toESM(require("node:fs"), 1);
function validateFlowFile(filePath) {
  if (!fs12.existsSync(filePath)) {
    return { exit: 2, message: `File not found: ${filePath}` };
  }
  let content;
  try {
    content = fs12.readFileSync(filePath, "utf8");
  } catch (err) {
    return { exit: 2, message: "Flow file could not be read." };
  }
  let flow;
  try {
    const raw = load(content, { schema: JSON_SCHEMA });
    if (raw === null || raw === void 0 || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        exit: 3,
        errors: [
          {
            type: "parse_error",
            message: `Invalid YAML: expected an object, got ${Array.isArray(raw) ? "array" : typeof raw}`,
            path: ""
          }
        ]
      };
    }
    flow = raw;
  } catch (err) {
    return {
      exit: 3,
      errors: [{ type: "parse_error", message: `YAML parse error \u2014 run 'flow validate' for details.`, path: "" }]
    };
  }
  const validator = new FlowValidator(void 0);
  const result = validator.validate(flow);
  if (result.summary.errors > 0) {
    const errors = result.issues.filter((i) => i.severity === "error").map(issueToCliError);
    return { exit: 1, errors };
  }
  return { exit: 0 };
}
function issueToCliError(issue) {
  return {
    type: validationCodeToType(issue.code),
    message: issue.message,
    path: issue.location?.path ?? issue.location?.stepId ?? ""
  };
}
function validationCodeToType(code) {
  switch (code) {
    case "MISSING_FIELD" /* MISSING_FIELD */:
    case "INVALID_TYPE" /* INVALID_TYPE */:
    case "INVALID_VALUE" /* INVALID_VALUE */:
    case "DUPLICATE_ID" /* DUPLICATE_ID */:
    case "EMPTY_COLLECTION" /* EMPTY_COLLECTION */:
    case "TYPE_MISMATCH" /* TYPE_MISMATCH */:
      return "schema";
    case "UNDEFINED_INPUT" /* UNDEFINED_INPUT */:
    case "UNDEFINED_OUTPUT" /* UNDEFINED_OUTPUT */:
    case "UNDEFINED_VARIABLE" /* UNDEFINED_VARIABLE */:
    case "UNDEFINED_FLOW" /* UNDEFINED_FLOW */:
      return "input";
    case "UNDEFINED_STEP" /* UNDEFINED_STEP */:
    case "UNREACHABLE_STEP" /* UNREACHABLE_STEP */:
    case "NO_TERMINAL_STEP" /* NO_TERMINAL_STEP */:
      return "graph";
    case "CIRCULAR_DEPENDENCY" /* CIRCULAR_DEPENDENCY */:
    case "CIRCULAR_SUBFLOW_REFERENCE" /* CIRCULAR_SUBFLOW_REFERENCE */:
      return "cycle";
    case "INVALID_TEMPLATE_SYNTAX" /* INVALID_TEMPLATE_SYNTAX */:
    case "MALFORMED_EXPRESSION" /* MALFORMED_EXPRESSION */:
    case "UNDECLARED_OUTPUT_KEY" /* UNDECLARED_OUTPUT_KEY */:
      return "template";
    case "UNUSED_INPUT" /* UNUSED_INPUT */:
    case "UNUSED_OUTPUT" /* UNUSED_OUTPUT */:
    case "MISSING_OUTPUT" /* MISSING_OUTPUT */:
    case "AUTO_DISCOVERED_INPUT" /* AUTO_DISCOVERED_INPUT */:
      return "input";
    default:
      throw new Error(`Unknown ValidationCode: ${String(code)}`);
  }
}

// dist/cli/commands/ValidateCommand.js
function registerValidateCommand(program2) {
  program2.command("validate <file>").description("Validate a flow YAML file").option("--json", "Output JSON (machine-readable, exit codes 0/1/2/3)").option("--human", "Force human-readable output").action((file, options) => {
    const result = validateFlowFile(file);
    if (options.json && !options.human) {
      switch (result.exit) {
        case 0:
          process.stdout.write(JSON.stringify({ valid: true }) + "\n");
          process.exit(0);
          break;
        case 1:
          process.stdout.write(JSON.stringify({ valid: false, errors: result.errors }) + "\n");
          process.exit(1);
          break;
        case 2:
          process.stdout.write(JSON.stringify({
            valid: false,
            errors: [{ type: "file_not_found", message: result.message, path: "" }]
          }) + "\n");
          process.exit(2);
          break;
        case 3:
          process.stdout.write(JSON.stringify({ valid: false, errors: result.errors }) + "\n");
          process.exit(3);
          break;
        default: {
          const _exhaustive = result;
          throw new Error(`Unexpected result: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
    if (result.exit === 2) {
      console.error(`\u2717 ${result.message}`);
      process.exit(1);
    }
    if (result.exit === 3) {
      console.error(`\u2717 Parse error: ${result.errors[0]?.message ?? "unknown"}`);
      process.exit(1);
    }
    if (result.exit === 1) {
      console.error(`\u2717 Flow has ${result.errors.length} error${result.errors.length > 1 ? "s" : ""}`);
      for (const err of result.errors) {
        const loc = err.path ? ` [${err.path}]` : "";
        console.error(`  - ${err.message}${loc}`);
      }
      process.exit(1);
    }
    console.log("\u2713 Flow is valid");
    process.exit(0);
  });
}

// dist/cli/FlowIndex.js
async function main() {
  let version;
  try {
    version = "1.0.0";
  } catch {
    const require2 = (0, import_module.createRequire)(__importMetaUrl);
    version = require2("../../package.json").version;
  }
  const program2 = new Command();
  program2.name("flow").version(version).description("CLI for running and validating agent flows");
  registerDocsCommand(program2);
  registerShowCommand(program2);
  registerValidateCommand(program2);
  registerRunCommand(program2);
  registerHistoryCommand(program2);
  await program2.parseAsync(process.argv);
}
var isEntryPoint = process.argv[1] !== void 0 && (process.argv[1] === (0, import_node_url3.fileURLToPath)(__importMetaUrl) || process.argv[1].endsWith("FlowIndex.js") || process.argv[1].endsWith("FlowIndex.ts"));
if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`Error: ${String(error)}
`);
    process.exit(1);
  });
}
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
