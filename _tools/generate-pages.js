const fs = require("fs");
const fetch = require("node-fetch");
const webidl = require("webidl2");

const arrayify = arr => Array.isArray(arr) ? arr : [{value: arr}];
const hasIdlDef = s => s.idl && s.idl.idlNames;
const defaultSort = (a,b) => a.value < b.value ? -1 : (a.value > b.value ? 1 : 0);

function generatePage(path, title, content) {
  fs.writeFileSync(path, `---
title: ${title}
layout: base
${path.includes('/') ? "base: ../" : ""}
---
${content}`);
}


function fullList(data, used_by) {
  let section = `<p><a href='../graph-cyto.html'>Graph of IDL inter-dependencies</a> <a href='../inheritance.html'>Tree of interface inheritiance</a></p>`;
  [{type:"interface", title: "Interfaces"}, {type:"interface mixin", title: "Interface Mixins"}, {type: "dictionary", title:"Dictionaries"}, {type:"typedef", title:"Typedefs"}, {type:"enum", title: "Enums"}, {type:"callback", title: "Callbacks"}, {type: "namespace", title: "Namespaces"}].forEach(
      type => {
        let list = ``;
        const names = data.filter(hasIdlDef)
              .map(spec =>
                   Object.keys(spec.idl.idlNames)
                   .filter(n => n!=="_dependencies")
                   .filter(n => spec.idl.idlNames[n].type === type.type)
                  ).reduce((a,b) => a.concat(b), [])
              .sort();
        names.forEach(name => {
          const usage = used_by[name] ? used_by[name].length : 0;
          list += `<li><a href='${name}.html'>${name}</a> <span title='used by ${usage} other IDL fragments'>(${usage})</span></li>`;
        });
        section += `<section><h2>${type.title}</h2>
<ol>${list}</ol></section>`;
      });
  return section;
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


function interfaceDetails(data, name, used_by) {
  let type;
  let mainDef = ``;
  let mainDefSpecs = [];
  data.filter(hasIdlDef)
    .filter(spec => spec.idl.idlNames[name])
    .forEach(spec => {
      mainDefSpecs.push(spec.url);
      type = (spec.idl.idlNames[name] || {}).type;
      const idlparsed = webidl.parse(spec.idl.idl).filter(i => (i.name === name && i.type === type) || (i.target === name & i.type === "includes"));
      mainDef += `<p><a href="${idlDfnLink(name, spec)}">${spec.title}</a> defines <code>${name}</code></p>
<pre class=webidl><code>${webidl.write(idlparsed)}</code></pre>`;
    });

  let partialDef = ``;
  partialDef.textContent = "This " + type + " is extended in the following specifications:";
  data.filter(hasIdlDef)
    .filter(spec => spec.idl.idlExtendedNames[name] && !mainDefSpecs.includes(spec.url))
    .forEach(spec => {
      const idlparsed = webidl.parse(spec.idl.idl).filter(i => (i.name === name && i.type === type) || (i.target === name & i.type === "includes"));
      partialDef += `<li><a href="${extendedIdlDfnLink(name, spec)}">${spec.title}</a>
<pre class=webidl><code>${webidl.write(idlparsed)}</code></pre></li>`;
    });
  if (partialDef) {
    partialDef = `<p>This ${type} is extended in the following specifications:</p><ol>${partialDef}</ol>`;
  }


  let usedBy = ``;
  (used_by[name] || []).forEach(n => {
    usedBy += `<li><a href="${n}.html">${n}</a></li>`;
  });
  if (usedBy) {
    usedBy = `<section>
  <h3>Refering IDL interfaces/dictionaries</h3>
  <ul>${usedBy}</ul>
</section>`;
  }

  let refs = ``;
  data.filter(s => s.idl && s.idl.externalDependencies && s.idl.externalDependencies.indexOf(name) !== -1)
    .forEach(spec => {
      refs += `<li><a href="${spec.url}">${spec.title}</a> refers to <code>${name}</code></li>`;
    });
  if (refs) {
    refs = `<section><h3>Refering specifications</h3><ul>${refs}</ul>
</section>`;
  }
  return `
<section>
  <h3>Definition</h3>
  ${mainDef}
  ${partialDef}
</section>
${usedBy}
  ${refs}`;
}

function enumNames(data) {
  let list ="";
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
    let specList = "";
    e.specs.forEach(s => {
      specList += `<li><a href="${s.url}">${s.title}</a> in enum <code><a href="names/${s.enumName}.html">${s.enumName}</a></code></li>`;
    });
    list += `<li id='x-${e.value}'><code>"${e.value}"</code><ol>${specList}</ol></li>`;
  });
  return `<p>Strings used as enumeration values:</p><ol>${list}</ol>`;
}

function extAttrUsage(data) {
  const extAttr = data.filter(hasIdlDef)
        .map(spec =>
             Object.keys(spec.idl.idlNames)
             .filter(n => n!=="_dependencies")
             .map(n => (spec.idl.idlNames[n].extAttrs || []).map(
               e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: `<a href='../names/${n}.html'>${n}</a>`, type: spec.idl.idlNames[n].type} };}
             )
                  .concat((spec.idl.idlNames[n].members || []).map(
                    m => (m.extAttrs || []).map( e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: `<a href='../names/${n}.html'>${n}</a>${m.name ? "." + m.name : ""}`, type: m.type}};}).reduce((a,b) => a.concat(b), [])))
                  .reduce((a,b) => a.concat(b), []))
             // TODO missing extended attributes on arguments, types (?)
                  ).reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => a.concat(b), [])
        .reduce((a,b) => {a[b.extAttr] = a[b.extAttr] ? a[b.extAttr].concat(b) : [b]; return a;}, {});
  let list = "";
  Object.keys(extAttr).forEach(
    e => {
      const notInWebIdlSpec = {"CEReactions": "https://html.spec.whatwg.org/multipage/custom-elements.html#cereactions", "WebGLHandlesContextLoss": "https://www.khronos.org/registry/webgl/specs/latest/1.0/#5.14", "HTMLConstructor": "https://html.spec.whatwg.org/multipage/dom.html#htmlconstructor"};
      let applyList = "";
      extAttr[e].forEach(a => {
        applyList += `<li>used on ${a.applyTo.type} <code>${a.applyTo.name}</code> in <a href="${a.url}">${a.title}</a></li>`;
      });
      list += `<li><a href="${notInWebIdlSpec[e] ? notInWebIdlSpec[e] : "http://heycam.github.io/webidl/#" + e}">${e}</a> <ol>${applyList}</ol></li>`;
    });
  return `<p>Extended attributes usage:</p><ol>${list}</ol>`;
}

function memberNames(data, sort) {
  let list = "";
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
  uniqueMemberNames.forEach(e => {
    let specList = "";
    e.specs.forEach(s => {
      specList += `<li>used as <strong>${s.type}</strong> in ${s.containerType} <code><a href="../names/${s.containerName}.html">${s.containerName}</a> in <a href="${s.url}">${s.title}</a></li>`;
    })
    list += `<li><code>${e.value}</code><ul>${specList}</ul></li>`;
  });
  return `<p>Names used for attributes/members/methods:</p><ol>${list}</ol>`;
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

    // Generating referenceable name pages
    for (let n of Object.keys(used_by)) {
      generatePage("names/" + n + ".html", n, interfaceDetails(results, n, used_by));
    }

    // Generating enum value list
    generatePage("enum.html", "Enum values", enumNames(results));

    // Generating IDL member names list
    generatePage("members.html", "IDL member names", memberNames(results));

    // Generating list of extended attributes
    generatePage("extended-attributes.html", "Extended Attributes", extAttrUsage(results));
  });
