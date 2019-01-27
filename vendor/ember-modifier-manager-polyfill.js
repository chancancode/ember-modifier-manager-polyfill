/* globals Ember */
/* eslint-disable ember/new-module-imports */

import { gte } from 'ember-compatibility-helpers';

(() => {
  'use strict';

  const getPrototypeOf = Object.getPrototypeOf;
  const { Application } = Ember;
  let MODIFIER_MANAGERS = new WeakMap();
  Ember._setModifierManager = function Polyfilled_setModifierManager(modifier, managerFactory) {
    MODIFIER_MANAGERS.set(modifier, managerFactory);
  };

  let getModifierManager = obj => {
    let pointer = obj;
    while (pointer !== undefined && pointer !== null) {
      if (MODIFIER_MANAGERS.has(pointer)) {
        return MODIFIER_MANAGERS.get(pointer);
      }

      pointer = getPrototypeOf(pointer);
    }

    return;
  };

  if (gte('3.1.0-beta.1')) {
    let valueForCapturedArgs = function valueForCapturedArgs(args) {
      return {
        named: args.named.value(),
        positional: args.positional.value(),
      };
    };

    Application.reopenClass({
      buildRegistry() {
        let registry = this._super(...arguments);

        let containerModule = gte('3.6.0-alpha.1') ? '@ember/-internals/container' : 'container';
        const P = Ember.__loader.require(containerModule).privatize;

        let compilerName = gte('3.2.0-alpha.1')
          ? P`template-compiler:main`
          : P`template-options:main`;
        let TemplateCompiler = registry.resolve(compilerName);

        let ORIGINAL_TEMPLATE_COMPILER_CREATE = TemplateCompiler.create;
        if (ORIGINAL_TEMPLATE_COMPILER_CREATE.__MODIFIER_MANAGER_PATCHED === true) {
          return registry;
        }

        TemplateCompiler.create = function() {
          let compiler = ORIGINAL_TEMPLATE_COMPILER_CREATE(...arguments);
          let compileTimeLookup = compiler.resolver;
          let runtimeResolver = compileTimeLookup.resolver;

          let CustomModifierDefinition;
          if (gte('3.6.0-alpha.1')) {
            class CustomModifierState {
              constructor(element, delegate, modifier, args) {
                this.element = element;
                this.delegate = delegate;
                this.modifier = modifier;
                this.args = args;
              }

              destroy() {
                const { delegate, modifier, args } = this;
                let modifierArgs = valueForCapturedArgs(args);
                delegate.destroyModifier(modifier, modifierArgs);
              }
            }

            class Polyfilled_CustomModifierManager {
              //create(element: Simple.Element, state: ModifierDefinitionState, args: IArguments, dynamicScope: DynamicScope, dom: DOMChanges): ModifierInstanceState;
              create(element, definition, args) {
                const capturedArgs = args.capture();
                let modifierArgs = valueForCapturedArgs(capturedArgs);
                let instance = definition.delegate.createModifier(
                  definition.ModifierClass,
                  modifierArgs
                );

                return new CustomModifierState(
                  element,
                  definition.delegate,
                  instance,
                  capturedArgs
                );
              }

              //getTag(modifier: ModifierInstanceState): Tag;
              getTag({ args }) {
                return args.tag;
              }

              //install(modifier: ModifierInstanceState): void;
              install(state) {
                let { element, args, delegate, modifier } = state;
                let modifierArgs = valueForCapturedArgs(args);
                delegate.installModifier(modifier, element, modifierArgs);
              }

              //update(modifier: ModifierInstanceState): void;
              update(state) {
                let { args, delegate, modifier } = state;
                let modifierArgs = valueForCapturedArgs(args);
                delegate.updateModifier(modifier, modifierArgs);
              }

              //getDestructor(modifier: ModifierInstanceState): Option<Destroyable>;
              getDestructor(state) {
                return state;
              }
            }

            CustomModifierDefinition = class Polyfilled_CustomModifierDefinition {
              constructor(name, ModifierClass, delegate) {
                this.name = name;
                this.state = {
                  ModifierClass,
                  name,
                  delegate,
                };
                this.manager = new Polyfilled_CustomModifierManager();
              }
            };
          } else {
            // TODO: rwjblue implement 3.1 - 3.5
          }

          runtimeResolver._lookupModifier = function(name, meta) {
            let builtin = this.builtInModifiers[name];

            if (builtin === undefined) {
              let { owner } = meta;
              let modifier = owner.factoryFor(`modifier:${name}`);
              if (modifier !== undefined) {
                let managerFactory = getModifierManager(modifier.class);
                let manager = managerFactory(owner);

                return new CustomModifierDefinition(name, modifier.class, manager);
              }
            }

            return builtin;
          };

          return compiler;
        };
        TemplateCompiler.create.__MODIFIER_MANAGER_PATCHED = true;

        return registry;
      },
    });
  }
})();
