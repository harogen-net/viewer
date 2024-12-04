import React, { useEffect, useState } from "react";
import { ViewerDocument } from "../model/ViewerDocument";
import { GlobalAny } from "../utils/GlobalAny";
import { DataType } from "../model/DataType";
import { Checkbox, Drawer, Form, Input, InputGroup, Placeholder, Radio, RadioGroup, Stack } from "rsuite";
import "rsuite/dist/rsuite.min.css";

export const ConfigPanel: React.FC<{ vdoc?: ViewerDocument }> = ({ vdoc }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formatType, setFormatType] = useState<DataType>(DataType.PNG);

  useEffect(() => {
    GlobalAny.configPanel_formatType = formatType;
    console.log(GlobalAny);
  }, [formatType]);

  return (
    <>
      <button
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
      >
        <i className="fas fa-ellipsis-h"></i>
      </button>
      <Drawer open={isOpen} onClose={() => setIsOpen(false)} size={"400px"}>
        <Drawer.Body>
          <dl>
            <dt>size</dt>
            <dd>
              <Stack direction="row" spacing={10}>
                <Input value={vdoc?.width}></Input>
                <Input plaintext value="x" />
                <Input value={vdoc?.height}></Input>
              </Stack>
            </dd>
          </dl>
          <dl>
            <dt>contents</dt>
            <dd>
              <label htmlFor="doc_sensitive">
                <Checkbox checked={false}>sensitive file</Checkbox>
                {/* <input type="checkbox" id="doc_sensitive" name="doc_sensitive" />
                  <span>sensitive file</span> */}
              </label>
            </dd>
          </dl>
          <dl>
            <dt>SAVE FORMAT TYPE</dt>
            <dd>
              <RadioGroup
                value={formatType}
                onChange={(value) => {
                  setFormatType(value as DataType);
                }}
              >
                <Radio value={DataType.PNG}>.png</Radio>
                <Radio value={DataType.HVZ}>.hvz(zipped)</Radio>
                <Radio value={DataType.HVD}>.hvd(text)</Radio>
              </RadioGroup>
            </dd>
          </dl>
        </Drawer.Body>
      </Drawer>
    </>
  );
};
