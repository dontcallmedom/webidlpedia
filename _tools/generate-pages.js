const fs = require("fs");
const fetch = require("node-fetch");
const webidl = require("webidl2");
const html = require('escape-html-template-tag')

const arrayify = arr => Array.isArray(arr) ? arr : [{value: arr}];
const hasIdlDef = s => s.idl && s.idl.idlNames;
const defaultSort = (a,b) => a.value < b.value ? -1 : (a.value > b.value ? 1 : 0);

// webidl2 cannot serialize its JSON output, only its "live" output
// so we start from the unparse IDL & reparse it to make it serializable
function extractSerializableIDLFromSpec(name, type, spec) {
  return webidl.parse(spec.idl.idl).filter(i => (i.name === name && i.type === type) || (i.target === name & i.type === "includes"));
}

function extractSerializableIDLMembersFromPlatform(name, type, data) {
  const relevantSpecs = data.filter(s => s.idl && s.idl.idlNames && s.idl.idlNames[name] && s.idl.idlNames[name].type === type);
  if (!relevantSpecs) { return []; }
  const idlparsed = webidl.parse(relevantSpecs.map(s => s.idl.idl).join("\n"))
        .filter(i => i.name === name && i.type === type);
  let members = [];
  idlparsed.forEach(i => {
    members = members.concat(i.members);
  });
  return members;
}

function generatePage(path, title, content) {
  fs.writeFileSync(path, `---
title: ${title}
layout: base
${path.includes('/') ? "base: ../" : ""}
---
${content}`);
}

const htmlLink = (text, href) => html`<a href="${href}">${text}</a>`;
const htmlSection = (title, content) => html`<section><h2>${title}</h2>${content}</section>`;
const htmlList = items => html`
  <ul>
    ${items.map(item => html`<li>${item}</li>`)}
  </ul>`;

function fullList(data, used_by) {
  let sections = [];
  [{type:"interface", title: "Interfaces"}, {type:"interface mixin", title: "Interface Mixins"}, {type: "dictionary", title:"Dictionaries"}, {type:"typedef", title:"Typedefs"}, {type:"enum", title: "Enums"}, {type:"callback", title: "Callbacks"}, {type: "namespace", title: "Namespaces"}].forEach(
      type => {
        const names = data.filter(hasIdlDef)
              .map(spec =>
                   Object.keys(spec.idl.idlNames)
                   .filter(n => n!=="_dependencies")
                   .filter(n => spec.idl.idlNames[n].type === type.type)
                  ).reduce((a,b) => a.concat(b), [])
              .sort();
        const list = htmlList(names.map(name => {
          const usage = used_by[name] ? used_by[name].length : 0;
          const link = htmlLink(name, name + ".html");
          return html`${link} <span title='used by ${usage} other IDL fragments'>(${usage})</span>`;
        }));
        sections.push(htmlSection(type.title, list));
      });
  return html.join(sections, '');
}

function idlDfnLink(name, spec) {
  let url = spec.url;
  const type = (spec.idl.idlNames[name] || {}).type;
  // Look for anchor among definitions to give more specific link if possible
  if (spec.dfns && type) {
    const dfn = spec.dfns.find(dfn => dfn.type === type.replace("callback interface", "callback") && dfn.linkingText.includes(name));
    if (dfn) {
      url = dfn.href;
    }
  }
  return url;
}

function extendedIdlDfnLink(name, spec) {
  let url = spec.url;
  if (!spec.idl.idlExtendedNames[name] || !spec.idl.idlExtendedNames[name].length) return url;
  // Look for anchor among definitions to give more specific link if possible
  // we use the first member of the object since partials aren't dfn'd
  const firstMember = (spec.idl.idlExtendedNames[name][0].members || [])[0];
  if (spec.dfns && firstMember) {
    const dfn = spec.dfns.find(dfn => dfn.type === firstMember.type.replace("operation", "method") && dfn.for.includes(name) && (dfn.linkingText.includes(firstMember.name) || dfn.localLinkingText.includes(firstMember.name)));
    if (dfn) {
      url = dfn.heading.id ? spec.url + "#" + dfn.heading.id : dfn.href;
    }
  }
  return url;
}


function interfaceDetails(data, name, used_by, templates) {
  let type;
  let mainDefItems = [];
  let mainDefSpecs = [];
  let consolidatedIdlDef;
  let consolidatedIdlMembers = [] ;
  let needsConsolidation = false;
  data.filter(hasIdlDef)
    .filter(spec => spec.idl.idlNames[name])
    .forEach(spec => {
      mainDefSpecs.push(spec.url);
      type = (spec.idl.idlNames[name] || {}).type;
      const idlparsed = extractSerializableIDLFromSpec(name, type, spec);
      // We use a proxy to keep the parseability of the objects created by WebIDL
      // while being able to replace the list of members
      const mainIdlDef = idlparsed.find(i => !i.partial);
      consolidatedIdlDef = new Proxy(mainIdlDef, {
        get(target, propKey, receiver) {
          if (propKey === "members") return consolidatedIdlMembers;
          return Reflect.get(...arguments);
        }
      });
      consolidatedIdlMembers = consolidatedIdlMembers.concat(mainIdlDef.members);
      /* not sure whether to consolidate across inheritance chain yet
         since inheritance has more impact than merging list of members
         it feels like it's probably left alone?
      if (mainIdlDef.inheritance) {
        let def = mainIdlDef;
        while (def.inheritance) {
          let members = extractSerializableIDLMembersFromPlatform(def.inheritance, type, data);
          needsConsolidation = true;
          consolidatedIdlMembers = consolidatedIdlMembers.concat(members);
          def = data.find(s => s.idl && s.idl.idlNames && s.idl.idlNames[def.inheritance]).idl.idlNames[def.inheritance];
        }
      }
      */
      idlparsed.filter(i => i.partial).forEach(i => {
        needsConsolidation = true;
        consolidatedIdlMembers =  consolidatedIdlMembers.concat(i.members);
      });
      idlparsed.filter(i => i.type === "includes").forEach(i => {
        let mixinMembers = extractSerializableIDLMembersFromPlatform(i.includes, "interface mixin", data);
        needsConsolidation = true;
        consolidatedIdlMembers = consolidatedIdlMembers.concat(mixinMembers);
      });
      mainDefItems.push(html`<p><a href="${idlDfnLink(name, spec)}">${spec.title}</a> defines <code>${name}</code></p>
<pre class=webidl><code>${webidl.write(idlparsed, {templates})}</code></pre>`);
    });

  let partialDefItems = [];
  data.filter(hasIdlDef)
    .filter(spec => spec.idl.idlExtendedNames[name] && !mainDefSpecs.includes(spec.url))
    .forEach(spec => {
      needsConsolidation = true;
      const idlparsed = extractSerializableIDLFromSpec(name, type, spec);
      idlparsed.filter(i => i.partial).forEach(i => {
        consolidatedIdlMembers = consolidatedIdlMembers.concat(i.members);
      });
      idlparsed.filter(i => i.type === "includes").forEach(i => {
        needsConsolidation = true;
        let mixinMembers = extractSerializableIDLMembersFromPlatform(i.includes, "interface mixin", data);
        consolidatedIdlMembers = consolidatedIdlMembers.concat(mixinMembers);
      });
      partialDefItems.push(html.join([htmlLink(spec.title, extendedIdlDfnLink(name, spec)), html`<pre class=webidl><code>${webidl.write(idlparsed, {templates})}</code></pre>`], ''));
    });
  let partialDef = "";
  if (partialDefItems.length) {
    partialDef = html.join([html`<p>This ${type} is extended in the following specifications:</p>`, htmlList(partialDefItems)], '');
  }

  let consolidatedDef = html``;
  if (needsConsolidation) {
    consolidatedDef = html`<details><summary>Consolidated IDL (across ${consolidatedIdlDef.type === "interface" ? "mixin and " : ""}partials)</summary><pre class=webidl><code>${webidl.write([consolidatedIdlDef], {templates})}</code></pre></details>`;
  }

  let usedBy = html``;
  let usedByList = [];
  (used_by[name] || []).forEach(n => {
    usedByList.push(html`<a href="${n}.html">${n}</a>`);
  });
  if (usedByList.length) {
    usedBy = html`<section>
  <h3>Refering IDL interfaces/dictionaries</h3>
  ${htmlList(usedByList)}
</section>`;
  }

  let refs = html``;
  let refList = [];
  data.filter(s => s.idl && s.idl.externalDependencies && s.idl.externalDependencies.indexOf(name) !== -1)
    .forEach(spec => {
      refList.push( html`<a href="${spec.url}">${spec.title}</a> refers to <code>${name}</code>`);
    });
  if (refList.length) {
    refs = html`<section><h3>Refering specifications</h3>${htmlList(refList)}</section>`;
  }
  return {title: `<code>${name}</code> ${type}`, content: html`
<section>
  <h3>Definition</h3>
  ${html.join(mainDefItems, '')}
  ${partialDef}
  ${consolidatedDef}
</section>
${usedBy}
  ${refs}`};
}

function enumNames(data) {
  let list = [];
  data.filter(hasIdlDef)
  const enumValues = data.filter(hasIdlDef)
        .map(spec =>
             Object.keys(spec.idl.idlNames)
             .filter(n => n!=="_dependencies")
             .filter(n => spec.idl.idlNames[n].type === "enum")
             .map(n => spec.idl.idlNames[n].values.map(v =>
                                                       {return {url: spec.url,title: spec.title, enumName: n, value: v.value};})
                  .reduce((a,b) => a.concat(b), [])))
        .reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => a.concat(b), [])
          .sort(defaultSort);
  const uniqueNames = enumValues.map(e => e.value);
  const uniqueEnumValues = enumValues.filter((e, i) => i === uniqueNames.indexOf(e.value))
        .map(e => {
          const matchingEnums = enumValues.filter(f => f.value === e.value);
          return {value: e.value,
                  specs: matchingEnums.map(f => { return {enumName: f.enumName, title: f.title, url: f.url};})
                 };
        });
  uniqueEnumValues.forEach(e => {
    let specList = e.specs.map(s =>
      html`<a href="${s.url}">${s.title}</a> in enum <code><a href="names/${s.enumName}.html">${s.enumName}</a></code>`
                              );
    list.push(html`<code id='x-${e.value}'>"${e.value}"</code>${htmlList(specList)}`);
  });
  return html`<p>Strings used as enumeration values:</p>${htmlList(list)}`;
}

function extAttrUsage(data) {
  const extAttr = data.filter(hasIdlDef)
        .map(spec =>
             Object.keys(spec.idl.idlNames)
             .filter(n => n!=="_dependencies")
             .map(n => (spec.idl.idlNames[n].extAttrs || []).map(
               e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: html`<a href='../names/${n}.html'>${n}</a>`, type: spec.idl.idlNames[n].type} };}
             )
                  .concat((spec.idl.idlNames[n].members || []).map(
                    m => (m.extAttrs || []).map( e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: html`<a href='../names/${n}.html'>${n}</a>${m.name ? "." + m.name : ""}`, type: m.type}};}).reduce((a,b) => a.concat(b), [])))
                  .reduce((a,b) => a.concat(b), []))
             // TODO missing extended attributes on arguments, types (?)
                  ).reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => {a[b.extAttr] = a[b.extAttr] ? a[b.extAttr].concat(b) : [b]; return a;}, {});
  let list = [];
  Object.keys(extAttr).forEach(
    e => {
      const notInWebIdlSpec = {"CEReactions": "https://html.spec.whatwg.org/multipage/custom-elements.html#cereactions", "WebGLHandlesContextLoss": "https://www.khronos.org/registry/webgl/specs/latest/1.0/#5.14", "HTMLConstructor": "https://html.spec.whatwg.org/multipage/dom.html#htmlconstructor"};
      let applyList = extAttr[e].map(a =>
        html`used on ${a.applyTo.type} <code>${a.applyTo.name}</code> in <a href="${a.url}">${a.title}</a>`
                                    );
      list.push(html`<a href="${notInWebIdlSpec[e] ? notInWebIdlSpec[e] : "http://heycam.github.io/webidl/#" + e}">${e}</a> ${htmlList(applyList)}`)
    });
  return html`<p>Extended attributes usage:</p>${htmlList(list)}`;
}

function memberNames(data, sort) {
  data.filter(hasIdlDef)
  const memberNames = data.filter(hasIdlDef)
        .map(spec =>
             Object.keys(spec.idl.idlNames)
             .filter(n => n!=="_dependencies")
             .filter(n => ["interface", "dictionary"].includes(spec.idl.idlNames[n].type))
             .map(n => spec.idl.idlNames[n].members.filter(v => v.name)
                  .map(v =>
                       {return {url: spec.url,title: spec.title, containerType: spec.idl.idlNames[n].type, containerName: n, value: v.name, type: v.type};})
                  .reduce((a,b) => a.concat(b), [])))
        .reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => a.concat(b), [])
        .sort(defaultSort);
  const uniqueNames = memberNames.map(e => e.value);
  const uniqueMemberNames = memberNames.filter((e, i) => i === uniqueNames.indexOf(e.value))
        .map(e => {
          const matchingNames = memberNames.filter(f => f.value === e.value);
          return {value: e.value,
                  specs: matchingNames.map(f => { return {containerName: f.containerName, containerType: f.containerType, type: f.type, title: f.title, url: f.url};})
                 };
        });
  let list = [];
  uniqueMemberNames.forEach(e => {
    let specList = e.specs.map(s =>
      html`used as <strong>${s.type}</strong> in ${s.containerType} <code><a href="../names/${s.containerName}.html">${s.containerName}</a></code> in <a href="${s.url}">${s.title}</a>`
                              );
    list.push(html`<code>${e.value}</code>${htmlList(specList)}`);
  });
  return html`<p>Names used for attributes/members/methods:</p>${htmlList(list)}`;
}

fetch("https://w3c.github.io/webref/ed/crawl.json")
  .then(r => r.json())
  .then(({results}) => {
    let used_by = {};
    results.forEach(s => {
      if (s.idl && s.idl.idlNames) {
        Object.keys(s.idl.idlNames).forEach(n => { if (!used_by[n]) used_by[n] = [];});
        Object.keys(s.idl.dependencies).forEach( n => {
          s.idl.dependencies[n].forEach(d => {
            if (!used_by[d]) {
              used_by[d] = [];
            }
        used_by[d].push(n);
          });
        });
      }
    });

    // Generating referenceable names page
    generatePage("names/index.html", "Referenceable IDL names", fullList(results, used_by));

    const webidlTemplate = {
      wrap: items => html.join(items, ''),
      trivia: t => {
        if (!t.trim()) {
          return t;
        }
        return html`<span class="comment">${t}</span>`;
      },
      definition: content => html`<span class=def>${content}</span>`,
      name: name => html`<strong>${name}</strong>`,
      nameless: kw => html`<strong>${kw}</strong>`,
      reference: name => used_by[name] ? html`<a href='${name}.html'>${name}</a>` : html`<span class=primitive>${name}</span>`
    };

    // Generating referenceable name pages
    for (let n of Object.keys(used_by)) {
      const {title, content} = interfaceDetails(results, n, used_by, webidlTemplate);
      generatePage("names/" + n + ".html", title, content);
    }

    // Generating enum value list
    generatePage("enum.html", "Enum values", enumNames(results));

    // Generating IDL member names list
    generatePage("members.html", "IDL member names", memberNames(results));

    // Generating list of extended attributes
    generatePage("extended-attributes.html", "Extended Attributes", extAttrUsage(results));
  });
