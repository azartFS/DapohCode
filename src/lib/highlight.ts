/** Lightweight syntax highlighter — zero dependencies.
 *  Handles: comments, strings, numbers, keywords, types, function calls.
 *  Not perfect, but makes code blocks 10x more readable. */

export type TokenType = "kw" | "str" | "cmt" | "num" | "fn" | "type" | "op" | "punc" | "text";
export interface Token { type: TokenType; text: string; }

const KW: Record<string, Set<string>> = {
  javascript: new Set(["break","case","catch","class","const","continue","debugger","default","delete","do","else","export","extends","finally","for","function","if","import","in","instanceof","let","new","of","return","super","switch","this","throw","try","typeof","var","void","while","with","yield","async","await","from","as","static","get","set"]),
  typescript: new Set(["break","case","catch","class","const","continue","debugger","default","delete","do","else","export","extends","finally","for","function","if","import","in","instanceof","let","new","of","return","super","switch","this","throw","try","typeof","var","void","while","with","yield","async","await","from","as","static","get","set","type","interface","enum","namespace","declare","abstract","implements","private","protected","public","readonly","override","keyof","infer","satisfies","is","asserts"]),
  rust: new Set(["as","async","await","break","const","continue","crate","dyn","else","enum","extern","false","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","Self","static","struct","super","trait","true","type","unsafe","use","where","while","macro_rules"]),
  python: new Set(["False","None","True","and","as","assert","async","await","break","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield"]),
  go: new Set(["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var","nil","true","false","iota"]),
  bash: new Set(["if","then","else","elif","fi","for","while","do","done","case","esac","in","function","return","local","export","readonly","declare","typeset","unset","shift","source","alias","echo","printf","read","test","exec","eval","exit","trap","wait","cd","pwd","true","false"]),
  css: new Set(["import","media","keyframes","font-face","supports","charset","namespace","page","layer"]),
  json: new Set([]),
  html: new Set([]),
  sql: new Set(["select","from","where","and","or","not","insert","into","values","update","set","delete","create","table","drop","alter","add","column","index","join","inner","left","right","outer","on","group","by","order","asc","desc","having","limit","offset","union","all","distinct","as","is","null","like","in","between","exists","case","when","then","end","count","sum","avg","min","max","primary","key","foreign","references","unique","check","default","constraint","cascade","trigger","view","procedure","function","begin","commit","rollback"]),
  c: new Set(["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof","static","struct","switch","typedef","union","unsigned","void","volatile","while","inline","restrict"]),
  cpp: new Set(["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof","static","struct","switch","typedef","union","unsigned","void","volatile","while","inline","restrict","class","namespace","template","typename","public","private","protected","virtual","override","final","new","delete","this","try","catch","throw","using","const_cast","static_cast","dynamic_cast","reinterpret_cast","nullptr","true","false","bool","constexpr","noexcept","decltype","auto","concept","requires","co_await","co_yield","co_return"]),
};

const TYPES: Record<string, Set<string>> = {
  rust: new Set(["bool","char","f32","f64","i8","i16","i32","i64","i128","isize","str","u8","u16","u32","u64","u128","usize","String","Vec","Box","Rc","Arc","Cell","RefCell","HashMap","HashSet","BTreeMap","BTreeSet","Option","Result","Some","None","Ok","Err","println","eprintln","format","panic","todo","unimplemented","unreachable","assert","assert_eq","assert_ne","vec","derive","cfg","test","allow","warn","deny"]),
  python: new Set(["int","float","str","bool","list","dict","set","tuple","range","len","print","input","open","type","isinstance","issubclass","super","object","enumerate","zip","map","filter","sorted","reversed","min","max","sum","abs","round","any","all","iter","next","Exception","ValueError","TypeError","KeyError","IndexError","AttributeError","RuntimeError","StopIteration","NotImplementedError","staticmethod","classmethod","property"]),
  typescript: new Set(["Array","Map","Set","Promise","Date","Error","RegExp","JSON","Math","Object","Function","console","window","document","HTMLElement","Event","Response","Request","URL","Buffer","process","Partial","Required","Readonly","Record","Pick","Omit","Exclude","Extract","NonNullable","ReturnType","Parameters","InstanceType","any","never","unknown","void","number","string","boolean","symbol","bigint","object","undefined","null"]),
  javascript: new Set(["Array","Map","Set","Promise","Date","Error","RegExp","JSON","Math","Object","Function","console","window","document","HTMLElement","Event","Response","Request","URL","Buffer","process","undefined","null","NaN","Infinity"]),
  go: new Set(["bool","byte","complex64","complex128","error","float32","float64","int","int8","int16","int32","int64","rune","string","uint","uint8","uint16","uint32","uint64","uintptr","fmt","log","os","io","net","http","context","sync","time","errors","strings","strconv","append","cap","close","copy","delete","len","make","new","panic","print","println","recover","complex","imag","real"]),
  c: new Set(["NULL","FILE","size_t","ssize_t","ptrdiff_t","int8_t","int16_t","int32_t","int64_t","uint8_t","uint16_t","uint32_t","uint64_t","bool","printf","fprintf","sprintf","scanf","malloc","calloc","realloc","free","memcpy","memset","strlen","strcmp","strcpy","strcat"]),
  cpp: new Set(["NULL","nullptr","size_t","string","vector","map","set","unordered_map","unordered_set","pair","tuple","array","deque","list","queue","stack","priority_queue","shared_ptr","unique_ptr","weak_ptr","optional","variant","any","cout","cin","cerr","endl","std","printf","fprintf","sprintf","scanf","malloc","calloc","realloc","free","memcpy","memset","strlen","strcmp","strcpy","strcat"]),
};

const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript",
  py: "python", py3: "python",
  rs: "rust",
  sh: "bash", zsh: "bash", shell: "bash",
  yml: "yaml",
  md: "markdown",
  h: "c", hpp: "cpp", cxx: "cpp", cc: "cpp",
  golang: "go",
  rb: "ruby",
  kt: "kotlin",
  dockerfile: "bash",
  makefile: "bash",
  toml: "bash",
  env: "bash",
  conf: "bash",
  ini: "bash",
  jsonc: "json",
};

function normLang(lang: string): string {
  const l = lang.toLowerCase().trim();
  return ALIASES[l] || l;
}

const HASH_LANGS = new Set(["python","bash","ruby","yaml","toml","dockerfile","makefile","r","perl","cmake"]);
const SLASH_LANGS = new Set(["javascript","typescript","rust","go","c","cpp","java","kotlin","css","scss","less","json","jsonc","swift","dart","php","scala","groovy","sql"]);

export function tokenize(code: string, lang: string): Token[] {
  const l = normLang(lang);
  const kw = KW[l] || KW["javascript"] || new Set();
  const types = TYPES[l] || new Set();
  const useHash = HASH_LANGS.has(l);
  const useSlash = SLASH_LANGS.has(l) || (!useHash && l !== "html" && l !== "xml");

  const tokens: Token[] = [];
  const len = code.length;
  let i = 0;

  while (i < len) {
    const ch = code[i];

    // Whitespace — pass through as text
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      let j = i + 1;
      while (j < len && (code[j] === " " || code[j] === "\t" || code[j] === "\n" || code[j] === "\r")) j++;
      tokens.push({ type: "text", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Multi-line comment /* */
    if (useSlash && ch === "/" && i + 1 < len && code[i + 1] === "*") {
      let j = i + 2;
      while (j + 1 < len && !(code[j] === "*" && code[j + 1] === "/")) j++;
      j = Math.min(j + 2, len);
      tokens.push({ type: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Single-line comment //
    if (useSlash && ch === "/" && i + 1 < len && code[i + 1] === "/") {
      let j = i + 2;
      while (j < len && code[j] !== "\n") j++;
      tokens.push({ type: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Hash comment #
    if (useHash && ch === "#") {
      let j = i + 1;
      while (j < len && code[j] !== "\n") j++;
      tokens.push({ type: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // HTML/XML comment <!-- -->
    if ((l === "html" || l === "xml" || l === "svg") && ch === "<" && code.slice(i, i + 4) === "<!--") {
      let j = i + 4;
      while (j + 2 < len && code.slice(j, j + 3) !== "-->") j++;
      j = Math.min(j + 3, len);
      tokens.push({ type: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // SQL single-line comment --
    if (l === "sql" && ch === "-" && i + 1 < len && code[i + 1] === "-") {
      let j = i + 2;
      while (j < len && code[j] !== "\n") j++;
      tokens.push({ type: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === quote) { j++; break; }
        if (quote !== "`" && code[j] === "\n") break;
        j++;
      }
      tokens.push({ type: "str", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if ((ch >= "0" && ch <= "9") || (ch === "." && i + 1 < len && code[i + 1] >= "0" && code[i + 1] <= "9")) {
      let j = i;
      if (ch === "0" && j + 1 < len) {
        const nx = code[j + 1];
        if (nx === "x" || nx === "X") { j += 2; while (j < len && /[0-9a-fA-F_]/.test(code[j])) j++; }
        else if (nx === "b" || nx === "B") { j += 2; while (j < len && /[01_]/.test(code[j])) j++; }
        else if (nx === "o" || nx === "O") { j += 2; while (j < len && /[0-7_]/.test(code[j])) j++; }
        else { j++; while (j < len && /[0-9_.]/.test(code[j])) j++; }
      } else {
        while (j < len && /[0-9_.]/.test(code[j])) j++;
      }
      if (j < len && (code[j] === "e" || code[j] === "E")) {
        j++;
        if (j < len && (code[j] === "+" || code[j] === "-")) j++;
        while (j < len && /[0-9]/.test(code[j])) j++;
      }
      // Type suffix (Rust: u32, i64, f64, etc.; Python: j for complex)
      while (j < len && /[a-zA-Z]/.test(code[j])) j++;
      tokens.push({ type: "num", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Identifiers & keywords
    if (/[a-zA-Z_$@]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let type: TokenType = "text";

      if (kw.has(word) || (l === "sql" && kw.has(word.toLowerCase()))) {
        type = "kw";
      } else if (types.has(word)) {
        type = "type";
      } else {
        // Heuristic: followed by ( → function call
        let k = j;
        while (k < len && (code[k] === " " || code[k] === "\t")) k++;
        if (k < len && code[k] === "(") {
          type = "fn";
        }
        // PascalCase → likely a type (MyComponent, HashMap, etc.)
        else if (word.length > 1 && word[0] >= "A" && word[0] <= "Z" && word !== word.toUpperCase()) {
          type = "type";
        }
      }

      tokens.push({ type, text: word });
      i = j;
      continue;
    }

    // Decorators @ (Python, TS)
    if (ch === "@" && i + 1 < len && /[a-zA-Z_]/.test(code[i + 1])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_.]/.test(code[j])) j++;
      tokens.push({ type: "fn", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // HTML/XML tags
    if ((l === "html" || l === "xml" || l === "svg" || l === "jsx" || l === "tsx") && ch === "<") {
      // Simple: color the < > and tag name
      tokens.push({ type: "punc", text: ch });
      i++;
      continue;
    }

    // Operators
    if ("+-*/%=!<>&|^~?:".includes(ch)) {
      let j = i + 1;
      while (j < len && "+-*/%=!<>&|^~?:".includes(code[j]) && j - i < 4) j++;
      tokens.push({ type: "op", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Punctuation
    if ("{}()[];,.".includes(ch)) {
      tokens.push({ type: "punc", text: ch });
      i++;
      continue;
    }

    // Everything else
    tokens.push({ type: "text", text: ch });
    i++;
  }

  return tokens;
}
