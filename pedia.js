const arrayify = arr => Array.isArray(arr) ? arr : [{value: arr}];

function formatIDLValue(def) {
  switch(def.type) {
  case "dictionary":
    return '{}';
  case "sequence":
    return '[]';
  case "null":
    return 'null';
  case "string":
    return `"${def.value}"`;
  case "boolean":
  case "number":
    return "" + def.value;
  }
}

function formatExtendedAttribute(extAttr) {
  return `${extAttr.name}${extAttr.rhs ? '=' + arrayify(extAttr.rhs.value).map(r => r.value).join(',') : ''}${extAttr.arguments.length ? '(' + extAttr.arguments.map(formatIDLItem).join(', ') + ')' : ''}`;
}

function formatIDLItem(item) {
  let idl = `${item.extAttrs && item.extAttrs.length ? '[' + item.extAttrs.map(formatExtendedAttribute).join(', ') + '] ' : ''}`;
  switch (item.type) {
  case "operation":
    idl += `${item.special ? item.special + ' ' : ''}${formatIDLType(item.idlType)} ${item.name}(${item.arguments.map(formatIDLItem).join(', ')})`;
    break;
  case "constructor":
    idl += `${item.type}(${item.arguments.map(formatIDLItem).join(', ')})`;
    break;
  case "attribute":
    idl += `${item.special ? item.special + ' ' : ''}${item.readonly ? "readonly " : ""}${item.type} ${formatIDLType(item.idlType)} ${item.name}`;
    break;
  case "maplike":
  case "setlike":
  case "iterable":
    idl += `${item.readonly ? "readonly " : ""}${item.async ? "async " : ""}${item.type}<${item.idlType.map(formatIDLType).join(', ')}>`;
    break;
  case "argument":
    idl += `${item.extAttrs.length ? '[' + item.extAttrs.map(formatExtendedAttribute).join(', ') + '] ' : ''}${item.optional ? "optional " : ""}${formatIDLType(item.idlType)}${item.variadic ? '...' : ''} ${item.name}${item.default ? ` = ${formatIDLValue(item.default)}` : ''}`;
    break;
  case "const":
    idl += `const ${formatIDLType(item.idlType)} ${item.name}`;
    break;
  case "value":
  case "member":
    idl += `${formatIDLType(item.idlType)} ${item.name}`;
  default:
    console.error(`Unhandled IDL item type ${item.type}`);
  }
  return idl;
}

function formatIDLType(idlType) {
  let idl = "${idlType.extAttrs.length ? '[' + idlType.extAttrs.map(formatExtendedAttribute).join(', ') + ']' : ''}";
  if (typeof idlType.idlType === "string") {
    idl = `${idlType.idlType}`;
  } else if (idlType.generic) {
    idl = `${idlType.generic}<${idlType.idlType.map(formatIDLType).join(', ')}>`;
  } else if (idlType.union) {
    idl = `(${idlType.idlType.map(formatIDLType).join(' or ')})`;
  }
  return idl + (idlType.nullable ? '?' : '');
}

function fromIDLParsedToIDL(obj) {
  let idl = `${obj.extAttrs && obj.extAttrs.length ? '[' + obj.extAttrs.map(formatExtendedAttribute).join(', ') + ']\n' : ''}${obj.partial ? 'partial ' : ''}${obj.type} ${obj.name} ${obj.inheritance ? ": " + obj.inheritance + " " : ''}{\n`;
  for (let m of (obj.members || obj.values || [])) {
    idl += `  ${formatIDLItem(m)};\n`;
  }
  idl += `};`;
  return idl;
}

fetch("https://w3c.github.io/webref/ed/crawl.json", {mode:"cors"})
    .then(r => r.json())
    .then(({results}) => {
        var used_by = {};
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
        const body = document.querySelector("body");
        const params = location.search.slice(1);
        const paramName = params.split("=")[0] || null;
        const paramValue = params.split("=")[1] || null;
        switch(paramName) {
        case "idlname":
            body.appendChild(interfaceDetails(results, paramValue, used_by));
            break;
        case "enums":
            body.appendChild(enumNames(results, paramValue));
            break;
        case "extattr":
            body.appendChild(extAttrUsage(results, paramValue));
            break;
        case "members":
            body.appendChild(memberNames(results, paramValue));
            break;
        case "full":
        default:
            body.appendChild(fullList(results, used_by, paramValue));
        }
    });

function fullList(data, used_by, sort) {

    const sortFn = sort === "popularity" ? ((a,b) => used_by[b].length - used_by[a].length) : defaultSort;

    const section = document.createElement("section");
    const p = document.createElement("p");
    var linkToGraph = document.createElement("a");
    linkToGraph.href = "graph-cyto.html";
    linkToGraph.textContent = "Graph of IDL inter-dependencies";
    p.appendChild(linkToGraph);
    section.appendChild(p);
    const p2 = document.createElement("p");
    var linkToGraph2 = document.createElement("a");
    linkToGraph2.href = "inheritance.html";
    linkToGraph2.textContent = "Tree of interface inheritance";
    p2.appendChild(linkToGraph2);
    section.appendChild(p2);
    section.appendChild(sorterLink("full", sort));

    [{type:"interface", title: "Interfaces"}, {type: "dictionary", title:"Dictionaries"}, {type:"typedef", title:"Typedefs"}, {type:"enum", title: "Enums"}, {type:"callback", title: "Callbacks"}].forEach(
        type => {
            const h2 = document.createElement("h2");
            h2.textContent = type.title;

            section.appendChild(h2);
            const ol = document.createElement("ol");
            const names = data.filter(hasIdlDef)
                  .map(spec =>
                       Object.keys(spec.idl.idlNames)
                       .filter(n => n!=="_dependencies")
                       .filter(n => spec.idl.idlNames[n].type === type.type)
                      ).reduce((a,b) => a.concat(b), [])
                  .sort(sortFn);
            names.forEach(name => {
                const item = document.createElement("li");
                const link = document.createElement("a");
                link.href= "?idlname=" + name;
                link.textContent = name;
                item.appendChild(link);
                const annotation = document.createElement("span");
                const usage = used_by[name] ? used_by[name].length : 0;
                annotation.title = "used by " + usage + " other IDL items";
                annotation.textContent = " (" + usage + ")";
                item.appendChild(annotation);
                ol.appendChild(item);
            });
            section.appendChild(ol);
        });
    return section;
}

function idlDfnLink(name, spec) {
  let url = spec.url;
  const type = (spec.idl.idlNames[name] || {}).type;
  // Look for anchor among definitions to give more specific link if possible
  if (spec.dfns && type) {
    const dfn = spec.dfns.find(dfn => dfn.type === type && dfn.linkingText.includes(name));
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
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = name;
    section.appendChild(h2);

    const defHeading = document.createElement("h3");
    defHeading.textContent = "Definition";
    section.appendChild(defHeading);
    let type;
    data.filter(hasIdlDef)
        .filter(spec => spec.idl.idlNames[name])
        .forEach(spec => {
            const mainDef = document.createElement("p");
            const link = document.createElement("a");
            link.textContent = spec.title;
            type = spec.idl.idlNames[name].type;
            link.href= idlDfnLink(name, spec);
            mainDef.appendChild(link);
            const code = document.createElement("code");
            code.textContent = name;
            mainDef.appendChild(document.createTextNode(" defines "));
            mainDef.appendChild(code);
            const idlFragment = document.createElement("pre");
            idlFragment.className = "webidl";
            idlFragment.textContent = fromIDLParsedToIDL(spec.idl.idlNames[name]);
            section.appendChild(mainDef);
            section.appendChild(idlFragment);
        });

    const partialDef = document.createElement("p");
    partialDef.textContent = "This " + type + " is extended in the following specifications:";
    const partialDefList = document.createElement("ol");
    data.filter(hasIdlDef)
        .filter(spec => spec.idl.idlExtendedNames[name])
        .forEach(spec => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            const partialIDLFragment = document.createElement("pre");
            partialIDLFragment.className = "webidl";

            link.href = extendedIdlDfnLink(name, spec);
            link.textContent = spec.title;
            partialIDLFragment.textContent = spec.idl.idlExtendedNames[name].map(fromIDLParsedToIDL).join("\n");
            item.appendChild(link);
            item.appendChild(partialIDLFragment);
            partialDefList.appendChild(item);


        });
    if (partialDefList.childNodes.length) {
        section.appendChild(partialDef);
        section.appendChild(partialDefList);
    }

    const usedByHeading = document.createElement("h3");
    usedByHeading.textContent = "Refering IDL interfaces/dictionaries";
    const usedByList = document.createElement("ol");
    (used_by[name] || []).forEach(n => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.textContent = n;
        link.href = "?idlname=" + n;
        item.appendChild(link);
        usedByList.appendChild(item);
    });
    if (usedByList.childNodes.length) {
        section.appendChild(usedByHeading);
        section.appendChild(usedByList);
    }

    const h3 = document.createElement("h3");
    h3.textContent = "Refering specifications";
    const ol = document.createElement("ol");
    data.filter(s => s.idl && s.idl.externalDependencies && s.idl.externalDependencies.indexOf(name) !== -1)
        .forEach(spec => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.textContent = spec.title + " refers to " + name + "";
            link.href= spec.url;
            item.appendChild(link);
            ol.appendChild(item);
        });
    if (ol.childNodes.length) {
        section.appendChild(h3);
        section.appendChild(ol);
    }
    return section;
}

function enumNames(data, sort) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = "Names used in enumerations";
    section.appendChild(h2);

    const sortFn = sort === "popularity" ? ((e1, e2) => e2.specs.length - e1.specs.length) : ((e1,e2) => -1);

    section.appendChild(sorterLink("enums", sort));

    const ol = document.createElement("ol");
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
          }).
          sort(sortFn);
    uniqueEnumValues.forEach(e => {
        const item = document.createElement("li");
        item.id = "x-" + e.value;
        item.appendChild(document.createTextNode('"'+ e.value + '"'));
        const specList = document.createElement("ol");
        e.specs.forEach(s => {
            const spec = document.createElement("li");
            spec.appendChild(document.createTextNode(" used in enum " + s.enumName + " in "));
            const link = document.createElement("a");
            link.href=s.url;
            link.textContent = s.title;
            spec.appendChild(link)
            specList.appendChild(spec);
        });
        item.appendChild(specList);
        ol.appendChild(item);
    });
    section.appendChild(ol);
    return section;

}

    function extAttrUsage(data, sort) {
        const section = document.createElement("section");
        const h2 = document.createElement("h2");
        h2.textContent = "Extended attributes usage";
        section.appendChild(h2);

        section.appendChild(sorterLink("extattr", sort));
        const extAttr = data.filter(hasIdlDef)
              .map(spec =>
                   Object.keys(spec.idl.idlNames)
                   .filter(n => n!=="_dependencies")
                   .map(n => (spec.idl.idlNames[n].extAttrs || []).map(
                       e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: n, type: spec.idl.idlNames[n].type} };}
                   )
                        .concat((spec.idl.idlNames[n].members || []).map(
                            m => (m.extAttrs || []).map( e => {return {url: spec.url, title: spec.title, extAttr: e.name, extAttrArgs: e.args, applyTo: {name: n + '.' + m.name, type: m.type}};}).reduce((a,b) => a.concat(b), [])))
                        .reduce((a,b) => a.concat(b), []))
                  ).reduce((a,b) => a.concat(b), [])
              .reduce((a,b) => a.concat(b), [])
              .reduce((a,b) => {a[b.extAttr] = a[b.extAttr] ? a[b.extAttr].concat(b) : [b]; return a;}, {});
        const ol = document.createElement("ol");

        const sortFn = sort === "popularity" ? ((e1, e2) => extAttr[e2].length - extAttr[e1].length) : undefined;

        Object.keys(extAttr).sort(sortFn).forEach(
            e => {
                const notInWebIdlSpec = {"CEReactions": "https://www.w3.org/TR/custom-elements/#cereactions", "WebGLHandlesContextLoss": "https://www.khronos.org/registry/webgl/specs/latest/1.0/#5.14"};
                const li = document.createElement("li");
                const deflink = document.createElement("a");
                deflink.textContent = e;
                if (notInWebIdlSpec[e]) {
                    deflink.href = notInWebIdlSpec[e];
                } else {
                    deflink.href = "http://heycam.github.io/webidl/#" + e;
                }
                li.appendChild(deflink);
                const applyList = document.createElement("ol");
                extAttr[e].forEach(a => {
                    const item = document.createElement("li");
                    item.appendChild(document.createTextNode(" used on " + a.applyTo.type + " " + a.applyTo.name + " in "));
                    const link = document.createElement("a");
                    link.href=a.url;
                    link.textContent = a.title;
                    item.appendChild(link)
                    applyList.appendChild(item);
                });
                li.appendChild(applyList);
                ol.appendChild(li);
            });
        section.appendChild(ol);
        return section;
    }

function memberNames(data, sort) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = "Names used for attributes/members/methods";
    section.appendChild(h2);

    const sortFn = sort === "popularity" ? ((e1, e2) => e2.specs.length - e1.specs.length) : defaultSort;

    section.appendChild(sorterLink("members", sort));

    const ol = document.createElement("ol");
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
          }).
          sort(sortFn);
    uniqueMemberNames.forEach(e => {
        const item = document.createElement("li");
        item.appendChild(document.createTextNode('"'+ e.value + '"'));
        const specList = document.createElement("ol");
        e.specs.forEach(s => {
            const spec = document.createElement("li");
            spec.appendChild(document.createTextNode(" used as "));
            const type = document.createElement("strong");
            type.textContent = s.type;
            spec.appendChild(type);
            spec.appendChild(document.createTextNode(" in " + s.containerType + " "));
            const idlLink = document.createElement("a");
            idlLink.href= "./?idlname=" + s.containerName;
            idlLink.textContent = s.containerName;
            spec.appendChild(idlLink)
            spec.appendChild(document.createTextNode(" in "));
            const link = document.createElement("a");
            link.href=s.url;
            link.textContent = s.title;
            spec.appendChild(link)
            specList.appendChild(spec);
        });
        item.appendChild(specList);
        ol.appendChild(item);
    });
    section.appendChild(ol);
    return section;
}


function sorterLink(paramName, sort) {
    const sorter = document.createElement("a");
    sorter.href = "?" + paramName + "=" + (sort === "popularity" ? "" : "popularity");
    sorter.textContent = "Sort by " + (sort === "popularity" ? "name" : "popularity");
    return sorter;
}

const hasIdlDef = s => s.idl && s.idl.idlNames;
const defaultSort = (a,b) => a.value < b.value ? -1 : (a.value > b.value ? 1 : 0);
