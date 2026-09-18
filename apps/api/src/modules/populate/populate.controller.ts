import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { type Params, withParams } from "../../common/rest";
import { idInput } from "../../common/schema";
import { populateSubmitInput } from "./populate.schema";
import { populateService } from "./populate.service";

// The Populate API — the REST face of trpc/routers/populate.ts, and the same
// submit the public form performs. Domain and Zod errors become HTTP statuses
// through the global DomainErrorFilter (common/domain-error.filter.ts).

@Controller("populate")
export class PopulateController {
  @Get(":id")
  form(@Param() params: Params) {
    return populateService.form(idInput.parse(params).id);
  }

  @Post(":id")
  submit(@Param() params: Params, @Body() body: unknown) {
    return populateService.submit(
      populateSubmitInput.parse(withParams(params, body)),
    );
  }
}
