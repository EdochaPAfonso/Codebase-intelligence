import { Project, SyntaxKind, Node, ClassDeclaration, InterfaceDeclaration, TypeAliasDeclaration, FunctionDeclaration, VariableStatement } from 'ts-morph';
import * as path from 'path';
import type { CodeParser } from '../../core/interfaces.js';
import type { ParsedFile, CodeSymbol, CodeDependency, SymbolKind, CodebaseFile } from '../../core/types.js';
import { ParseError } from '../../core/errors.js';

export class TypeScriptParser implements CodeParser {
  private project: Project;

  constructor() {
    this.project = new Project();
  }

  public supports(language: string): boolean {
    return language === 'typescript' || language === 'javascript';
  }

  public async parse(filePath: string): Promise<ParsedFile> {
    // In a real scenario we'd read the file content, but ts-morph can do it or we can pass it in.
    // The prompt says `parse(file: string)` where `file` is the absolute path.
    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      try {
        this.project.addSourceFileAtPath(filePath);
        sourceFile = this.project.getSourceFile(filePath);
      } catch (e) {
        throw new ParseError(filePath, e);
      }
    }

    if (!sourceFile) {
      throw new ParseError(filePath, new Error("Could not create source file"));
    }

    const symbols: CodeSymbol[] = [];
    const dependencies: CodeDependency[] = [];

    // Extract imports
    const importDeclarations = sourceFile.getImportDeclarations();
    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      let target = moduleSpecifier;
      let type: 'import' | 'unresolved' = 'unresolved';

      if (moduleSpecifier.startsWith('.')) {
        // Resolve relative path roughly
        const dir = path.dirname(filePath);
        target = path.resolve(dir, moduleSpecifier).replace(/\\/g, '/');
        // If it doesn't have an extension, it's hard to know exactly without checking FS,
        // but we'll register the resolved path as target. We'll keep it 'import' type,
        // but it might need '.ts' or '/index.ts' appended later.
        type = 'import';
      } else {
        // Absolute or node_modules
        type = 'import'; 
      }

      dependencies.push({
        source: filePath.replace(/\\/g, '/'),
        target,
        type
      });
    }

    // Extract Symbols
    const addSymbol = (name: string, kind: SymbolKind, node: Node, parentId?: string): string => {
      const id = `${filePath}#${name}`;
      const symbol: CodeSymbol = {
        id,
        name,
        kind,
        file: filePath.replace(/\\/g, '/'),
        startLine: node.getStartLineNumber(),
        endLine: node.getEndLineNumber()
      };
      if (parentId) symbol.parentId = parentId;
      symbols.push(symbol);
      return id;
    };

    // Classes
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName();
      if (!className) continue;
      const classId = addSymbol(className, 'class', cls);

      // Methods
      for (const method of cls.getMethods()) {
        const methodName = method.getName();
        addSymbol(methodName, 'method', method, classId);
      }

      // Extends / Implements
      const baseClass = cls.getBaseClass();
      if (baseClass) {
        const baseName = baseClass.getName();
        if (baseName) {
           dependencies.push({ source: classId, target: baseName, type: 'extends' });
        }
      }
      for (const impl of cls.getImplements()) {
        dependencies.push({ source: classId, target: impl.getText(), type: 'implements' });
      }
    }

    // Interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const ifaceName = iface.getName();
      const ifaceId = addSymbol(ifaceName, 'interface', iface);

      for (const ext of iface.getExtends()) {
        dependencies.push({ source: ifaceId, target: ext.getText(), type: 'extends' });
      }
    }

    // Type Aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      addSymbol(typeAlias.getName(), 'typeAlias', typeAlias);
    }

    // Functions
    for (const func of sourceFile.getFunctions()) {
      const funcName = func.getName();
      if (funcName) {
        addSymbol(funcName, 'function', func);
      }
    }

    // Module-level Variables
    for (const varStmt of sourceFile.getVariableStatements()) {
      for (const varDecl of varStmt.getDeclarations()) {
        addSymbol(varDecl.getName(), 'variable', varDecl);
      }
    }

    // Prepare a mock CodebaseFile since we just parsed it directly from path.
    // In a real scenario, the caller would pass the CodebaseFile, but interface says `file: string`.
    const codebaseFile: CodebaseFile = {
      path: filePath,
      relativePath: path.basename(filePath), // Rough mock
      language: this.supports('typescript') ? 'typescript' : 'javascript',
      size: sourceFile.getFullText().length
    };

    return {
      file: codebaseFile,
      symbols,
      dependencies
    };
  }
}
