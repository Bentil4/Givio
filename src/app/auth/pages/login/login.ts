import { Component } from '@angular/core';
import { Input, Button } from "../../../shared/components";

@Component({
  selector: 'app-login',
  imports: [Input, Button],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {

}
